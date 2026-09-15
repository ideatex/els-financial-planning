import { db } from '@/lib/db';
import { recordAuditLog } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/core/errors/AppError';
import {
  createPlanVersionSchema,
  updatePlanVersionSchema,
  updatePlanVersionStatusSchema,
  duplicatePlanVersionSchema,
} from '@/lib/validations/planning';
import { z } from 'zod';

export async function getPlanVersions(
  orgId: string,
  cycleId: string,
  filters?: { status?: string; versionType?: string }
) {
  const where: Record<string, unknown> = {
    organizationId: orgId,
    planningCycleId: cycleId,
  };

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.versionType) {
    where.versionType = filters.versionType;
  }

  return db.planVersion.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      baseVersion: { select: { id: true, versionCode: true, versionName: true } },
      derivedVersions: { select: { id: true, versionCode: true, versionName: true } },
      _count: {
        select: { derivedVersions: true },
      },
    },
  });
}

export async function getPlanVersionById(orgId: string, versionId: string) {
  const version = await db.planVersion.findFirst({
    where: { id: versionId, organizationId: orgId },
    include: {
      planningCycle: {
        select: { id: true, name: true, fiscalYear: true, status: true },
      },
      owner: { select: { id: true, name: true, email: true } },
      baseVersion: { select: { id: true, versionCode: true, versionName: true } },
      derivedVersions: { select: { id: true, versionCode: true, versionName: true, status: true } },
    },
  });

  if (!version) {
    throw new NotFoundError(`Plan version with ID '${versionId}' not found`);
  }

  return version;
}

export async function createPlanVersion(
  orgId: string,
  userId: string,
  cycleId: string,
  data: z.infer<typeof createPlanVersionSchema>
) {
  const cycle = await db.planningCycle.findFirst({
    where: { id: cycleId, organizationId: orgId },
  });

  if (!cycle) {
    throw new NotFoundError(`Planning cycle with ID '${cycleId}' not found`);
  }

  if (cycle.status === 'CLOSED' || cycle.status === 'ARCHIVED') {
    throw new ValidationError(`Cannot add plan versions to a ${cycle.status.toLowerCase()} planning cycle`);
  }

  const validated = createPlanVersionSchema.parse(data);

  // Check unique versionCode in this cycle
  const existingCode = await db.planVersion.findFirst({
    where: {
      planningCycleId: cycleId,
      versionCode: validated.versionCode,
    },
  });

  if (existingCode) {
    throw new ConflictError(
      `Plan version code '${validated.versionCode}' already exists in this planning cycle`
    );
  }

  // If baseVersionId provided, check it exists and belongs to this cycle
  if (validated.baseVersionId) {
    const base = await db.planVersion.findFirst({
      where: {
        id: validated.baseVersionId,
        organizationId: orgId,
        planningCycleId: cycleId,
      },
    });
    if (!base) {
      throw new ValidationError('Base version to branch from was not found in this cycle');
    }
  }

  const version = await db.planVersion.create({
    data: {
      organizationId: orgId,
      planningCycleId: cycleId,
      versionName: validated.versionName,
      versionCode: validated.versionCode,
      versionType: validated.versionType,
      description: validated.description || null,
      scenarioLabel: validated.scenarioLabel || null,
      baseVersionId: validated.baseVersionId || null,
      ownerUserId: validated.ownerUserId || userId,
      status: 'DRAFT',
      createdById: userId,
    },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      baseVersion: { select: { id: true, versionCode: true, versionName: true } },
    },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'CREATE',
    entityType: 'PlanVersion',
    entityId: version.id,
    metadata: {
      versionName: version.versionName,
      versionCode: version.versionCode,
      versionType: version.versionType,
      planningCycleId: cycleId,
      status: version.status,
    },
  });

  return version;
}

export async function updatePlanVersion(
  orgId: string,
  userId: string,
  versionId: string,
  data: z.infer<typeof updatePlanVersionSchema>
) {
  const existing = await getPlanVersionById(orgId, versionId);

  // Strict Immutability Rule:
  // Once APPROVED, LOCKED, or ARCHIVED, properties cannot be edited directly.
  if (existing.status === 'APPROVED' || existing.status === 'LOCKED' || existing.status === 'ARCHIVED') {
    throw new ValidationError(
      `Plan version is ${existing.status.toLowerCase()} and immutable. Branch into a new version to make changes.`
    );
  }

  const validated = updatePlanVersionSchema.parse(data);

  const updated = await db.planVersion.update({
    where: { id: versionId },
    data: {
      ...(validated.versionName && { versionName: validated.versionName }),
      ...(validated.versionType && { versionType: validated.versionType }),
      ...(validated.description !== undefined && { description: validated.description }),
      ...(validated.scenarioLabel !== undefined && { scenarioLabel: validated.scenarioLabel }),
      ...(validated.ownerUserId !== undefined && { ownerUserId: validated.ownerUserId }),
      updatedById: userId,
    },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'UPDATE',
    entityType: 'PlanVersion',
    entityId: versionId,
    metadata: {
      oldVersionName: existing.versionName,
      newVersionName: updated.versionName,
      oldVersionType: existing.versionType,
      newVersionType: updated.versionType,
      scenarioLabel: updated.scenarioLabel,
    },
  });

  return updated;
}

export async function updatePlanVersionStatus(
  orgId: string,
  userId: string,
  versionId: string,
  data: z.infer<typeof updatePlanVersionStatusSchema>
) {
  const existing = await getPlanVersionById(orgId, versionId);
  const validated = updatePlanVersionStatusSchema.parse(data);

  if (existing.status === validated.status) {
    return existing;
  }

  // State transitions:
  // DRAFT -> IN_REVIEW, ARCHIVED
  // IN_REVIEW -> APPROVED, REJECTED, DRAFT
  // REJECTED -> DRAFT, ARCHIVED
  // APPROVED -> LOCKED, ARCHIVED
  // LOCKED -> ARCHIVED
  // ARCHIVED -> (none)
  const allowedTransitions: Record<string, string[]> = {
    DRAFT: ['IN_REVIEW', 'ARCHIVED'],
    IN_REVIEW: ['APPROVED', 'REJECTED', 'DRAFT'],
    REJECTED: ['DRAFT', 'ARCHIVED'],
    APPROVED: ['LOCKED', 'ARCHIVED'],
    LOCKED: ['ARCHIVED'],
    ARCHIVED: [],
  };

  const validNextStates = allowedTransitions[existing.status] || [];
  if (!validNextStates.includes(validated.status)) {
    throw new ValidationError(
      `Cannot transition plan version from '${existing.status}' to '${validated.status}'. Allowed: ${validNextStates.join(', ')}`
    );
  }

  const updateData: {
    status: string;
    updatedById: string;
    rejectionReason?: string | null;
    submittedDate?: Date;
    approvedDate?: Date;
    lockedDate?: Date;
  } = {
    status: validated.status,
    updatedById: userId,
  };

  if (validated.status === 'IN_REVIEW') {
    updateData.submittedDate = new Date();
  } else if (validated.status === 'APPROVED') {
    updateData.approvedDate = new Date();
  } else if (validated.status === 'REJECTED') {
    updateData.rejectionReason = validated.rejectionReason;
  } else if (validated.status === 'LOCKED') {
    updateData.lockedDate = new Date();
  } else if (validated.status === 'DRAFT') {
    // Reset rejection reason when returning to draft
    updateData.rejectionReason = null;
  }

  const updated = await db.planVersion.update({
    where: { id: versionId },
    data: updateData,
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'STATUS_CHANGE',
    entityType: 'PlanVersion',
    entityId: versionId,
    metadata: {
      oldStatus: existing.status,
      newStatus: validated.status,
      rejectionReason: validated.rejectionReason || null,
    },
  });

  return updated;
}

export async function duplicatePlanVersion(
  orgId: string,
  userId: string,
  versionId: string,
  data: z.infer<typeof duplicatePlanVersionSchema>
) {
  const source = await getPlanVersionById(orgId, versionId);
  const validated = duplicatePlanVersionSchema.parse(data);

  // Check unique newVersionCode in same cycle
  const existingCode = await db.planVersion.findFirst({
    where: {
      planningCycleId: source.planningCycleId,
      versionCode: validated.newVersionCode,
    },
  });

  if (existingCode) {
    throw new ConflictError(
      `Version code '${validated.newVersionCode}' already exists in this planning cycle`
    );
  }

  const duplicated = await db.planVersion.create({
    data: {
      organizationId: orgId,
      planningCycleId: source.planningCycleId,
      versionName: validated.newVersionName,
      versionCode: validated.newVersionCode,
      versionType: source.versionType,
      description: `Branched from ${source.versionCode} (${source.versionName})`,
      scenarioLabel: validated.scenarioLabel || source.scenarioLabel,
      baseVersionId: source.id,
      ownerUserId: userId,
      status: 'DRAFT',
      createdById: userId,
    },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      baseVersion: { select: { id: true, versionCode: true, versionName: true } },
    },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'BRANCH_VERSION',
    entityType: 'PlanVersion',
    entityId: duplicated.id,
    metadata: {
      versionName: duplicated.versionName,
      versionCode: duplicated.versionCode,
      baseVersionId: source.id,
      sourceVersionCode: source.versionCode,
    },
  });

  return duplicated;
}

export async function deletePlanVersion(orgId: string, userId: string, versionId: string) {
  const existing = await getPlanVersionById(orgId, versionId);

  if (existing.status === 'APPROVED' || existing.status === 'LOCKED') {
    throw new ValidationError(`Cannot delete an ${existing.status.toLowerCase()} plan version due to financial audit immutability`);
  }

  // Check if any versions derive from this version
  const childCount = await db.planVersion.count({
    where: { baseVersionId: versionId },
  });

  if (childCount > 0) {
    throw new ValidationError(`Cannot delete version '${existing.versionCode}' because other versions are derived from it`);
  }

  await db.planVersion.delete({
    where: { id: versionId },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'DELETE',
    entityType: 'PlanVersion',
    entityId: versionId,
    metadata: {
      versionCode: existing.versionCode,
      versionName: existing.versionName,
      status: existing.status,
    },
  });

  return { success: true };
}
