import { db } from '@/lib/db';

export async function getOrganizationAuditLogs(orgId: string, limit = 100) {
  const logs = await db.auditLog.findMany({
    where: { organizationId: orgId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: Math.min(limit, 200),
  });

  return logs.map((log) => ({
    id: log.id,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    metadata: log.metadata ? JSON.parse(log.metadata) : null,
    createdAt: log.createdAt,
    actor: log.user
      ? {
          id: log.user.id,
          name: log.user.name,
          email: log.user.email,
        }
      : null,
  }));
}
