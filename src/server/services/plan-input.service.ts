import { db } from '@/lib/db';
import { recordAuditLog } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/core/errors/AppError';
import {
  planInputSchema,
  batchPlanInputsSchema,
} from '@/lib/validations/plan-inputs';
import { z } from 'zod';

export interface PlanInputFilters {
  planningCycleId?: string;
  planVersionId: string;
  inputCategory?: string;
  fiscalPeriodId?: string;
  plantId?: string;
  productId?: string;
  materialId?: string;
  accountId?: string;
  status?: string;
}

export async function getPlanInputs(orgId: string, filters: PlanInputFilters) {
  const where: Record<string, unknown> = {
    organizationId: orgId,
    planVersionId: filters.planVersionId,
  };

  if (filters.planningCycleId) where.planningCycleId = filters.planningCycleId;
  if (filters.inputCategory) where.inputCategory = filters.inputCategory;
  if (filters.fiscalPeriodId) where.fiscalPeriodId = filters.fiscalPeriodId;
  if (filters.plantId) where.plantId = filters.plantId;
  if (filters.productId) where.productId = filters.productId;
  if (filters.materialId) where.materialId = filters.materialId;
  if (filters.accountId) where.accountId = filters.accountId;
  if (filters.status) where.status = filters.status;

  return db.planInput.findMany({
    where,
    orderBy: [
      { inputCategory: 'asc' },
      { fiscalPeriod: { periodNumber: 'asc' } },
      { inputCode: 'asc' },
    ],
    include: {
      fiscalPeriod: { select: { id: true, periodName: true, periodNumber: true, fiscalYear: true, quarter: true, status: true } },
      plant: { select: { id: true, code: true, name: true } },
      product: { select: { id: true, code: true, name: true, category: true, productType: true } },
      material: { select: { id: true, code: true, name: true, category: true } },
      account: { select: { id: true, code: true, name: true, accountType: true } },
      driver: { select: { id: true, driverCode: true, driverName: true, driverCategory: true } },
      createdByUser: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function getPlanInputById(orgId: string, inputId: string) {
  const planInput = await db.planInput.findFirst({
    where: { id: inputId, organizationId: orgId },
    include: {
      fiscalPeriod: true,
      plant: true,
      product: true,
      material: true,
      account: true,
      driver: true,
      planVersion: true,
      createdByUser: { select: { id: true, name: true, email: true } },
    },
  });

  if (!planInput) {
    throw new NotFoundError(`Plan input '${inputId}' not found`);
  }

  return planInput;
}

async function verifyVersionIsEditable(orgId: string, versionId: string) {
  const version = await db.planVersion.findFirst({
    where: { id: versionId, organizationId: orgId },
  });

  if (!version) {
    throw new NotFoundError(`Plan version '${versionId}' not found`);
  }

  if (version.status === 'APPROVED' || version.status === 'LOCKED') {
    throw new ValidationError(
      `Cannot modify planning inputs for an ${version.status.toLowerCase()} plan version due to financial audit immutability`
    );
  }

  return version;
}

export async function upsertPlanInput(
  orgId: string,
  userId: string,
  data: z.input<typeof planInputSchema>
) {
  const validated = planInputSchema.parse(data);
  await verifyVersionIsEditable(orgId, validated.planVersionId);

  // Check fiscal period is not LOCKED
  const period = await db.fiscalPeriod.findFirst({
    where: { id: validated.fiscalPeriodId, fiscalCalendar: { organizationId: orgId } },
  });
  if (!period) {
    throw new ValidationError(`Fiscal period '${validated.fiscalPeriodId}' not found in organization`);
  }
  if (period.status === 'LOCKED') {
    throw new ValidationError(`Cannot enter planning inputs for locked fiscal period '${period.periodName}'`);
  }

  // Find existing by exact dimensional grain
  const existing = await db.planInput.findFirst({
    where: {
      organizationId: orgId,
      planVersionId: validated.planVersionId,
      fiscalPeriodId: validated.fiscalPeriodId,
      inputCategory: validated.inputCategory,
      inputCode: validated.inputCode,
      plantId: validated.plantId || null,
      productId: validated.productId || null,
      materialId: validated.materialId || null,
      accountId: validated.accountId || null,
    },
  });

  let saved;
  if (existing) {
    saved = await db.planInput.update({
      where: { id: existing.id },
      data: {
        inputValue: validated.inputValue,
        unitOfMeasure: validated.unitOfMeasure,
        currency: validated.currency || 'USD',
        sourceType: validated.sourceType,
        sourceReference: validated.sourceReference,
        isOverridden: validated.isOverridden,
        overrideReason: validated.isOverridden ? validated.overrideReason : null,
        status: validated.status,
        notes: validated.notes,
        driverId: validated.driverId || null,
        updatedById: userId,
      },
      include: {
        fiscalPeriod: true,
        plant: true,
        product: true,
        material: true,
        account: true,
        driver: true,
      },
    });
  } else {
    saved = await db.planInput.create({
      data: {
        organizationId: orgId,
        planningCycleId: validated.planningCycleId,
        planVersionId: validated.planVersionId,
        fiscalPeriodId: validated.fiscalPeriodId,
        plantId: validated.plantId || null,
        productId: validated.productId || null,
        materialId: validated.materialId || null,
        accountId: validated.accountId || null,
        driverId: validated.driverId || null,
        inputCategory: validated.inputCategory,
        inputCode: validated.inputCode,
        inputValue: validated.inputValue,
        unitOfMeasure: validated.unitOfMeasure,
        currency: validated.currency || 'USD',
        sourceType: validated.sourceType,
        sourceReference: validated.sourceReference,
        isOverridden: validated.isOverridden,
        overrideReason: validated.isOverridden ? validated.overrideReason : null,
        status: validated.status,
        notes: validated.notes,
        createdById: userId,
        updatedById: userId,
      },
      include: {
        fiscalPeriod: true,
        plant: true,
        product: true,
        material: true,
        account: true,
        driver: true,
      },
    });
  }

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: validated.isOverridden ? 'PLAN_INPUT_OVERRIDDEN' : 'PLAN_INPUT_UPSERTED',
    entityType: 'PlanInput',
    entityId: saved.id,
    metadata: {
      category: saved.inputCategory,
      code: saved.inputCode,
      value: saved.inputValue,
      periodId: saved.fiscalPeriodId,
      versionId: saved.planVersionId,
      isOverridden: saved.isOverridden,
      overrideReason: saved.overrideReason || null,
    },
  });

  return saved;
}

export async function batchUpsertPlanInputs(
  orgId: string,
  userId: string,
  data: z.input<typeof batchPlanInputsSchema>
) {
  const validated = batchPlanInputsSchema.parse(data);
  await verifyVersionIsEditable(orgId, validated.planVersionId);

  const results = [];
  for (const item of validated.inputs) {
    const saved = await upsertPlanInput(orgId, userId, item);
    results.push(saved);
  }

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'PLAN_INPUTS_BATCH_SAVED',
    entityType: 'PlanVersion',
    entityId: validated.planVersionId,
    metadata: {
      count: results.length,
      versionId: validated.planVersionId,
    },
  });

  return { success: true, count: results.length, inputs: results };
}

export async function deletePlanInput(orgId: string, userId: string, inputId: string) {
  const existing = await getPlanInputById(orgId, inputId);
  await verifyVersionIsEditable(orgId, existing.planVersionId);

  if (existing.status === 'APPROVED' || existing.status === 'LOCKED') {
    throw new ValidationError(`Cannot delete an ${existing.status.toLowerCase()} plan input`);
  }

  await db.planInput.delete({ where: { id: inputId } });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'PLAN_INPUT_DELETED',
    entityType: 'PlanInput',
    entityId: inputId,
    metadata: {
      category: existing.inputCategory,
      code: existing.inputCode,
      value: existing.inputValue,
    },
  });

  return { success: true };
}
