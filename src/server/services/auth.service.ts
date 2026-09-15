import { db } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/password';
import { createSession, invalidateSession } from '@/lib/session';
import { recordAuditLog } from '@/lib/audit';
import { ConflictError, UnauthorizedError, ValidationError } from '@/core/errors/AppError';
import { Roles } from '@/core/domain/roles';
import { RegisterInput, LoginInput } from '@/lib/validations/auth';

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'org'}-${Math.random().toString(36).substring(2, 7)}`;
}

export async function registerUser(
  input: RegisterInput,
  metadata?: { userAgent?: string | null; ip?: string | null }
) {
  const existingUser = await db.user.findUnique({
    where: { email: input.email },
  });

  if (existingUser) {
    throw new ConflictError('A user with this email address already exists');
  }

  const passwordHash = await hashPassword(input.password);
  const orgSlug = generateSlug(input.organizationName);

  // Atomic transaction to create User, Organization, Membership, and initial Session
  const result = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name,
      },
    });

    const organization = await tx.organization.create({
      data: {
        name: input.organizationName,
        slug: orgSlug,
      },
    });

    const membership = await tx.membership.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        role: Roles.ADMIN,
      },
    });

    return { user, organization, membership };
  });

  const { session, sessionToken } = await createSession(
    result.user.id,
    result.organization.id,
    metadata?.userAgent,
    metadata?.ip
  );

  await recordAuditLog({
    organizationId: result.organization.id,
    userId: result.user.id,
    action: 'USER_REGISTERED',
    entityType: 'USER',
    entityId: result.user.id,
    metadata: {
      email: result.user.email,
      organizationName: result.organization.name,
      role: Roles.ADMIN,
    },
  });

  return {
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
    },
    organization: {
      id: result.organization.id,
      name: result.organization.name,
      slug: result.organization.slug,
    },
    membership: {
      id: result.membership.id,
      role: result.membership.role,
    },
    sessionToken,
    expiresAt: session.expiresAt,
  };
}

export async function loginUser(
  input: LoginInput,
  metadata?: { userAgent?: string | null; ip?: string | null }
) {
  const user = await db.user.findUnique({
    where: { email: input.email },
    include: {
      memberships: {
        include: {
          organization: true,
        },
      },
    },
  });

  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const isValidPassword = await verifyPassword(input.password, user.passwordHash);
  if (!isValidPassword) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const defaultMembership = user.memberships[0] || null;
  const activeOrgId = defaultMembership?.organizationId || null;

  const { session, sessionToken } = await createSession(
    user.id,
    activeOrgId,
    metadata?.userAgent,
    metadata?.ip
  );

  if (activeOrgId) {
    await recordAuditLog({
      organizationId: activeOrgId,
      userId: user.id,
      action: 'USER_LOGGED_IN',
      entityType: 'USER',
      entityId: user.id,
    });
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
    organization: defaultMembership?.organization
      ? {
          id: defaultMembership.organization.id,
          name: defaultMembership.organization.name,
          slug: defaultMembership.organization.slug,
        }
      : null,
    membership: defaultMembership
      ? {
          id: defaultMembership.id,
          role: defaultMembership.role,
        }
      : null,
    sessionToken,
    expiresAt: session.expiresAt,
  };
}

export async function logoutUser(sessionToken: string) {
  await invalidateSession(sessionToken);
}
