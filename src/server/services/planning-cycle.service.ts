import { db } from '@/lib/db';
import { recordAuditLog } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/core/errors/AppError';
import {
  createPlanningCycleSchema,
  updatePlanningCycleSchema,
  updatePlanningCycleStatusSchema,
} from '@/lib/validations/planning';
import { z } from 'zod';

export async function getPlanningCycles(
  orgId: string,
  filters?: { status?: string; fiscalYear?: number; search?: string }
) {
  const where: Record<string, unknown> = { organizationId: orgId };

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.fiscalYear) {
    where.fiscalYear = filters.fiscalYear;
  }

  if (filters?.search) {
    const q = filters.search.trim();
    where.OR = [
      { name: { contains: q } },
      { description: { contains: q } },
    ];
  }

  return db.planningCycle.findMany({
    where,
    orderBy: [{ fiscalYear: 'desc' }, { createdAt: 'desc' }],
    include: {
      owner: {
        select: { id: true, name: true, email: true },
      },
      startPeriod: true,
      endPeriod: true,
      planVersions: {
        select: {
          id: true,
          versionCode: true,
          versionName: true,
          versionType: true,
          status: true,
        },
      },
      _count: {
        select: { planVersions: true },
      },
    },
  });
}

export async function getPlanningCycleById(orgId: string, cycleId: string) {
  const cycle = await db.planningCycle.findFirst({
    where: { id: cycleId, organizationId: orgId },
    include: {
      owner: {
        select: { id: true, name: true, email: true },
      },
      startPeriod: true,
      endPeriod: true,
      planVersions: {
        orderBy: { createdAt: 'asc' },
        include: {
          owner: { select: { id: true, name: true, email: true } },
          baseVersion: { select: { id: true, versionCode: true, versionName: true } },
        },
      },
    },
  });

  if (!cycle) {
    throw new NotFoundError(`Planning cycle with ID '${cycleId}' not found`);
  }

  return cycle;
}

export async function createPlanningCycle(
  orgId: string,
  userId: string,
  data: z.infer<typeof createPlanningCycleSchema>
) {
  const validated = createPlanningCycleSchema.parse(data);

  // Check unique name per org
  const existing = await db.planningCycle.findFirst({
    where: {
      organizationId: orgId,
      name: validated.name,
    },
  });

  if (existing) {
    throw new ConflictError(`Planning cycle '${validated.name}' already exists in this organization`);
  }

  // Validate period bounds if supplied
  if (validated.startPeriodId && validated.endPeriodId) {
    const startPeriod = await db.fiscalPeriod.findFirst({
      where: {
        id: validated.startPeriodId,
        fiscalCalendar: { organizationId: orgId },
      },
    });
    const endPeriod = await db.fiscalPeriod.findFirst({
      where: {
        id: validated.endPeriodId,
        fiscalCalendar: { organizationId: orgId },
      },
    });

    if (!startPeriod || !endPeriod) {
      throw new ValidationError('Specified start or end fiscal period was not found in this organization');
    }

    if (startPeriod.startDate > endPeriod.endDate) {
      throw new ValidationError('Start period cannot begin after the end period finishes');
    }
  }

  const cycle = await db.planningCycle.create({
    data: {
      organizationId: orgId,
      name: validated.name,
      planningType: validated.planningType,
      fiscalYear: validated.fiscalYear,
      startPeriodId: validated.startPeriodId || null,
      endPeriodId: validated.endPeriodId || null,
      description: validated.description || null,
      ownerUserId: validated.ownerUserId || userId,
      status: 'DRAFT',
      createdById: userId,
    },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      startPeriod: true,
      endPeriod: true,
    },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'CREATE',
    entityType: 'PlanningCycle',
    entityId: cycle.id,
    metadata: {
      name: cycle.name,
      planningType: cycle.planningType,
      fiscalYear: cycle.fiscalYear,
      status: cycle.status,
    },
  });

  return cycle;
}

export async function updatePlanningCycle(
  orgId: string,
  userId: string,
  cycleId: string,
  data: z.infer<typeof updatePlanningCycleSchema>
) {
  const existing = await getPlanningCycleById(orgId, cycleId);

  if (existing.status === 'ARCHIVED' || existing.status === 'CLOSED') {
    throw new ValidationError(`Cannot modify a planning cycle with status '${existing.status}'`);
  }

  const validated = updatePlanningCycleSchema.parse(data);

  if (validated.name && validated.name !== existing.name) {
    const conflict = await db.planningCycle.findFirst({
      where: {
        organizationId: orgId,
        name: validated.name,
        id: { not: cycleId },
      },
    });
    if (conflict) {
      throw new ConflictError(`Planning cycle '${validated.name}' already exists in this organization`);
    }
  }

  // Validate period bounds if updated
  const startId = validated.startPeriodId !== undefined ? validated.startPeriodId : existing.startPeriodId;
  const endId = validated.endPeriodId !== undefined ? validated.endPeriodId : existing.endPeriodId;

  if (startId && endId) {
    const startPeriod = await db.fiscalPeriod.findFirst({
      where: { id: startId, fiscalCalendar: { organizationId: orgId } },
    });
    const endPeriod = await db.fiscalPeriod.findFirst({
      where: { id: endId, fiscalCalendar: { organizationId: orgId } },
    });

    if (!startPeriod || !endPeriod) {
      throw new ValidationError('Specified start or end fiscal period was not found');
    }

    if (startPeriod.startDate > endPeriod.endDate) {
      throw new ValidationError('Start period cannot begin after the end period finishes');
    }
  }

  const updated = await db.planningCycle.update({
    where: { id: cycleId },
    data: {
      ...(validated.name && { name: validated.name }),
      ...(validated.planningType && { planningType: validated.planningType }),
      ...(validated.fiscalYear !== undefined && { fiscalYear: validated.fiscalYear }),
      ...(validated.startPeriodId !== undefined && { startPeriodId: validated.startPeriodId }),
      ...(validated.endPeriodId !== undefined && { endPeriodId: validated.endPeriodId }),
      ...(validated.description !== undefined && { description: validated.description }),
      ...(validated.ownerUserId !== undefined && { ownerUserId: validated.ownerUserId }),
      updatedById: userId,
    },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'UPDATE',
    entityType: 'PlanningCycle',
    entityId: cycleId,
    metadata: {
      oldName: existing.name,
      newName: updated.name,
      oldPlanningType: existing.planningType,
      newPlanningType: updated.planningType,
      oldFiscalYear: existing.fiscalYear,
      newFiscalYear: updated.fiscalYear,
    },
  });

  return updated;
}

export async function updatePlanningCycleStatus(
  orgId: string,
  userId: string,
  cycleId: string,
  data: z.infer<typeof updatePlanningCycleStatusSchema>
) {
  const existing = await getPlanningCycleById(orgId, cycleId);
  const validated = updatePlanningCycleStatusSchema.parse(data);

  if (existing.status === validated.status) {
    return existing;
  }

  // State transitions:
  // DRAFT -> OPEN -> IN_REVIEW -> APPROVED -> CLOSED -> ARCHIVED
  // Also allow ARCHIVED from any terminal state
  const allowedTransitions: Record<string, string[]> = {
    DRAFT: ['OPEN', 'ARCHIVED'],
    OPEN: ['IN_REVIEW', 'DRAFT', 'ARCHIVED'],
    IN_REVIEW: ['APPROVED', 'OPEN', 'ARCHIVED'],
    APPROVED: ['CLOSED', 'ARCHIVED'],
    CLOSED: ['OPEN', 'ARCHIVED'],
    ARCHIVED: ['DRAFT'],
  };

  const validNextStates = allowedTransitions[existing.status] || [];
  if (!validNextStates.includes(validated.status)) {
    throw new ValidationError(
      `Cannot transition planning cycle from '${existing.status}' to '${validated.status}'. Allowed: ${validNextStates.join(', ')}`
    );
  }

  const updated = await db.planningCycle.update({
    where: { id: cycleId },
    data: {
      status: validated.status,
      updatedById: userId,
    },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'UPDATE',
    entityType: 'PlanningCycle',
    entityId: cycleId,
    metadata: { oldStatus: existing.status, newStatus: validated.status },
  });

  return updated;
}

export async function deletePlanningCycle(orgId: string, userId: string, cycleId: string) {
  const existing = await getPlanningCycleById(orgId, cycleId);

  if (existing.status !== 'DRAFT' && existing.status !== 'ARCHIVED') {
    throw new ValidationError(`Cannot delete planning cycle with status '${existing.status}'. Only DRAFT or ARCHIVED cycles can be deleted`);
  }

  // Check if there are any approved or locked plan versions
  const lockedOrApproved = existing.planVersions?.some(
    (v) => v.status === 'APPROVED' || v.status === 'LOCKED'
  );

  if (lockedOrApproved) {
    throw new ValidationError('Cannot delete planning cycle containing approved or locked plan versions');
  }

  await db.planningCycle.delete({
    where: { id: cycleId },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'DELETE',
    entityType: 'PlanningCycle',
    entityId: cycleId,
    metadata: { name: existing.name, status: existing.status },
  });

  return { success: true };
}
