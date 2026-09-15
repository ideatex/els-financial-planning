import { db } from '@/lib/db';
import { recordAuditLog } from '@/lib/audit';
import { ConflictError, NotFoundError, ForbiddenError, ValidationError } from '@/core/errors/AppError';
import { Roles, Role } from '@/core/domain/roles';
import { CreateOrganizationInput, AddMemberInput } from '@/lib/validations/organization';
import { hashPassword } from '@/lib/password';

export async function getUserOrganizations(userId: string) {
  const memberships = await db.membership.findMany({
    where: { userId },
    include: {
      organization: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  return memberships.map((m) => ({
    organizationId: m.organization.id,
    name: m.organization.name,
    slug: m.organization.slug,
    role: m.role as Role,
    joinedAt: m.createdAt,
  }));
}

export async function createOrganization(userId: string, input: CreateOrganizationInput) {
  const existingOrg = await db.organization.findUnique({
    where: { slug: input.slug },
  });

  if (existingOrg) {
    throw new ConflictError(`Organization slug '${input.slug}' is already taken`);
  }

  const result = await db.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name: input.name,
        slug: input.slug,
      },
    });

    const membership = await tx.membership.create({
      data: {
        userId,
        organizationId: organization.id,
        role: Roles.ADMIN,
      },
    });

    return { organization, membership };
  });

  await recordAuditLog({
    organizationId: result.organization.id,
    userId,
    action: 'ORGANIZATION_CREATED',
    entityType: 'ORGANIZATION',
    entityId: result.organization.id,
    metadata: { name: result.organization.name, slug: result.organization.slug },
  });

  return result.organization;
}

export async function switchActiveOrganization(
  sessionToken: string,
  userId: string,
  targetOrgId: string
) {
  const membership = await db.membership.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId: targetOrgId,
      },
    },
    include: {
      organization: true,
    },
  });

  if (!membership) {
    throw new ForbiddenError('You are not a member of this organization');
  }

  await db.session.update({
    where: { sessionToken },
    data: {
      activeOrganizationId: targetOrgId,
    },
  });

  return {
    organization: {
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
    },
    role: membership.role as Role,
  };
}

export async function getOrganizationMembers(orgId: string) {
  const members = await db.membership.findMany({
    where: { organizationId: orgId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  return members.map((m) => ({
    id: m.id,
    userId: m.user.id,
    name: m.user.name,
    email: m.user.email,
    role: m.role as Role,
    joinedAt: m.createdAt,
  }));
}

export async function addMemberToOrganization(
  actingUserId: string,
  orgId: string,
  input: AddMemberInput
) {
  let user = await db.user.findUnique({
    where: { email: input.email },
  });

  if (!user) {
    // Generate placeholder account that user can set password for later
    const tempPasswordHash = await hashPassword('TempPassword123!');
    user = await db.user.create({
      data: {
        email: input.email,
        name: input.name || input.email.split('@')[0],
        passwordHash: tempPasswordHash,
      },
    });
  }

  const existingMembership = await db.membership.findUnique({
    where: {
      userId_organizationId: {
        userId: user.id,
        organizationId: orgId,
      },
    },
  });

  if (existingMembership) {
    throw new ConflictError('User is already a member of this organization');
  }

  const membership = await db.membership.create({
    data: {
      userId: user.id,
      organizationId: orgId,
      role: input.role,
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId: actingUserId,
    action: 'MEMBER_ADDED',
    entityType: 'MEMBERSHIP',
    entityId: membership.id,
    metadata: {
      memberEmail: user.email,
      role: input.role,
    },
  });

  return {
    id: membership.id,
    userId: membership.user.id,
    email: membership.user.email,
    name: membership.user.name,
    role: membership.role as Role,
    joinedAt: membership.createdAt,
  };
}

export async function updateMemberRole(
  actingUserId: string,
  orgId: string,
  targetUserId: string,
  newRole: Role
) {
  const targetMembership = await db.membership.findUnique({
    where: {
      userId_organizationId: {
        userId: targetUserId,
        organizationId: orgId,
      },
    },
  });

  if (!targetMembership) {
    throw new NotFoundError('Member not found in this organization');
  }

  // Prevent demoting the sole remaining ADMIN in the organization
  if (targetMembership.role === Roles.ADMIN && newRole !== Roles.ADMIN) {
    const adminCount = await db.membership.count({
      where: {
        organizationId: orgId,
        role: Roles.ADMIN,
      },
    });

    if (adminCount <= 1) {
      throw new ValidationError('Cannot demote the sole administrator of the organization');
    }
  }

  const updated = await db.membership.update({
    where: { id: targetMembership.id },
    data: { role: newRole },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId: actingUserId,
    action: 'MEMBER_ROLE_UPDATED',
    entityType: 'MEMBERSHIP',
    entityId: updated.id,
    metadata: {
      targetUserId,
      previousRole: targetMembership.role,
      newRole,
    },
  });

  return updated;
}

export async function removeMemberFromOrganization(
  actingUserId: string,
  orgId: string,
  targetUserId: string
) {
  const targetMembership = await db.membership.findUnique({
    where: {
      userId_organizationId: {
        userId: targetUserId,
        organizationId: orgId,
      },
    },
  });

  if (!targetMembership) {
    throw new NotFoundError('Member not found in this organization');
  }

  if (targetMembership.role === Roles.ADMIN) {
    const adminCount = await db.membership.count({
      where: {
        organizationId: orgId,
        role: Roles.ADMIN,
      },
    });

    if (adminCount <= 1) {
      throw new ValidationError('Cannot remove the sole administrator of the organization');
    }
  }

  await db.membership.delete({
    where: { id: targetMembership.id },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId: actingUserId,
    action: 'MEMBER_REMOVED',
    entityType: 'MEMBERSHIP',
    entityId: targetMembership.id,
    metadata: {
      targetUserId,
      previousRole: targetMembership.role,
    },
  });

  return { success: true };
}
