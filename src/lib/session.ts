import crypto from 'crypto';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { UnauthorizedError, ForbiddenError } from '@/core/errors/AppError';
import { Role, Permission, hasPermission, Roles } from '@/core/domain/roles';

export const COOKIE_NAME = process.env.COOKIE_NAME || 'els_fpa_session';
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface AuthenticatedContext {
  session: {
    id: string;
    token: string;
    expiresAt: Date;
    activeOrganizationId: string | null;
  };
  user: {
    id: string;
    email: string;
    name: string;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
  } | null;
  membership: {
    id: string;
    role: Role;
  } | null;
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function createSession(
  userId: string,
  activeOrganizationId?: string | null,
  userAgent?: string | null,
  ipAddress?: string | null
) {
  const sessionToken = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  const session = await db.session.create({
    data: {
      sessionToken,
      userId,
      activeOrganizationId: activeOrganizationId ?? null,
      expiresAt,
      userAgent: userAgent ?? null,
      ipAddress: ipAddress ?? null,
    },
  });

  return { session, sessionToken };
}

export async function invalidateSession(sessionToken: string) {
  if (!sessionToken) return;
  try {
    await db.session.delete({
      where: { sessionToken },
    });
  } catch {
    // Already removed or expired
  }
}

export async function getSessionContext(token?: string | null): Promise<AuthenticatedContext | null> {
  let sessionToken = token;

  if (!sessionToken) {
    try {
      const cookieStore = cookies();
      sessionToken = cookieStore.get(COOKIE_NAME)?.value;
    } catch {
      // Cookies not available outside Next request context
    }
  }

  if (!sessionToken) {
    return null;
  }

  const session = await db.session.findUnique({
    where: { sessionToken },
    include: {
      user: {
        include: {
          memberships: {
            include: {
              organization: true,
            },
          },
        },
      },
    },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await invalidateSession(sessionToken);
    }
    return null;
  }

  const { user } = session;
  let activeOrgId = session.activeOrganizationId;

  // Resolve active membership
  let activeMembership = user.memberships.find((m) => m.organizationId === activeOrgId);

  // If no active org selected or invalid, fall back to first membership
  if (!activeMembership && user.memberships.length > 0) {
    activeMembership = user.memberships[0];
    activeOrgId = activeMembership.organizationId;
    await db.session.update({
      where: { id: session.id },
      data: { activeOrganizationId: activeOrgId },
    });
  }

  return {
    session: {
      id: session.id,
      token: session.sessionToken,
      expiresAt: session.expiresAt,
      activeOrganizationId: activeOrgId,
    },
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
    organization: activeMembership?.organization
      ? {
          id: activeMembership.organization.id,
          name: activeMembership.organization.name,
          slug: activeMembership.organization.slug,
        }
      : null,
    membership: activeMembership
      ? {
          id: activeMembership.id,
          role: activeMembership.role as Role,
        }
      : null,
  };
}

export async function requireAuth(token?: string | null): Promise<AuthenticatedContext> {
  const context = await getSessionContext(token);
  if (!context) {
    throw new UnauthorizedError('Valid session token required');
  }
  return context;
}

export async function requireOrgContext(token?: string | null): Promise<AuthenticatedContext & {
  organization: NonNullable<AuthenticatedContext['organization']>;
  membership: NonNullable<AuthenticatedContext['membership']>;
}> {
  const context = await requireAuth(token);
  if (!context.organization || !context.membership) {
    throw new ForbiddenError('No active organization membership found for this user');
  }
  return context as AuthenticatedContext & {
    organization: NonNullable<AuthenticatedContext['organization']>;
    membership: NonNullable<AuthenticatedContext['membership']>;
  };
}

export async function requirePermission(permission: Permission, token?: string | null): Promise<AuthenticatedContext & {
  organization: NonNullable<AuthenticatedContext['organization']>;
  membership: NonNullable<AuthenticatedContext['membership']>;
}> {
  const context = await requireOrgContext(token);
  if (!hasPermission(context.membership.role, permission)) {
    throw new ForbiddenError(`Permission denied: Missing '${permission}' role privilege`);
  }
  return context;
}

export async function requireRole(allowedRoles: Role[], token?: string | null): Promise<AuthenticatedContext & {
  organization: NonNullable<AuthenticatedContext['organization']>;
  membership: NonNullable<AuthenticatedContext['membership']>;
}> {
  const context = await requireOrgContext(token);
  if (!allowedRoles.includes(context.membership.role)) {
    throw new ForbiddenError(
      `Access denied: Required role in [${allowedRoles.join(', ')}], current role is '${context.membership.role}'`
    );
  }
  return context;
}
