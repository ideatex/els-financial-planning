import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

export interface AuditEventParams {
  organizationId: string;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function recordAuditLog(params: AuditEventParams) {
  try {
    const metadataString = params.metadata ? JSON.stringify(params.metadata) : null;
    const log = await db.auditLog.create({
      data: {
        organizationId: params.organizationId,
        userId: params.userId ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        metadata: metadataString,
      },
    });

    logger.info(`[AUDIT] ${params.action} on ${params.entityType}:${params.entityId || 'N/A'}`, {
      organizationId: params.organizationId,
      userId: params.userId ?? undefined,
      action: params.action,
    });

    return log;
  } catch (err) {
    logger.error('Failed to record audit log', {
      organizationId: params.organizationId,
      action: params.action,
    }, err);
    // Audit log failure should not crash core transaction, but must be logged
    return null;
  }
}
