import { db } from '@/lib/db';
import { recordAuditLog } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/core/errors/AppError';
import {
  createAssumptionSchema,
  updateAssumptionSchema,
  copyAssumptionsSchema,
} from '@/lib/validations/assumptions';
import { z } from 'zod';

export interface AssumptionFilters {
  planningCycleId?: string;
  planVersionId: string;
  category?: string;
  plantId?: string;
  productId?: string;
  search?: string;
  status?: string;
}

export async function getAssumptions(orgId: string, filters: AssumptionFilters) {
  const where: Record<string, unknown> = {
    organizationId: orgId,
    planVersionId: filters.planVersionId,
  };

  if (filters.planningCycleId) where.planningCycleId = filters.planningCycleId;
  if (filters.category) where.category = filters.category;
  if (filters.plantId) where.plantId = filters.plantId;
  if (filters.productId) where.productId = filters.productId;
  if (filters.status) where.status = filters.status;

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search } },
      { code: { contains: filters.search } },
      { description: { contains: filters.search } },
    ];
  }

  return db.assumption.findMany({
    where,
    orderBy: [{ category: 'asc' }, { code: 'asc' }],
    include: {
      effectiveFromPeriod: { select: { id: true, periodName: true, periodNumber: true } },
      effectiveToPeriod: { select: { id: true, periodName: true, periodNumber: true } },
      plant: { select: { id: true, code: true, name: true } },
      product: { select: { id: true, code: true, name: true } },
      account: { select: { id: true, code: true, name: true } },
      createdByUser: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function getAssumptionById(orgId: string, assumptionId: string) {
  const assumption = await db.assumption.findFirst({
    where: { id: assumptionId, organizationId: orgId },
    include: {
      effectiveFromPeriod: true,
      effectiveToPeriod: true,
      plant: true,
      product: true,
      account: true,
      planVersion: true,
      createdByUser: { select: { id: true, name: true, email: true } },
    },
  });

  if (!assumption) {
    throw new NotFoundError(`Assumption '${assumptionId}' not found`);
  }

  return assumption;
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
      `Cannot modify assumptions for an ${version.status.toLowerCase()} plan version due to financial audit immutability`
    );
  }

  return version;
}

export async function createAssumption(
  orgId: string,
  userId: string,
  data: z.input<typeof createAssumptionSchema>
) {
  const validated = createAssumptionSchema.parse(data);
  await verifyVersionIsEditable(orgId, validated.planVersionId);

  // Check code uniqueness per plan version
  const existingCode = await db.assumption.findUnique({
    where: {
      planVersionId_code: {
        planVersionId: validated.planVersionId,
        code: validated.code,
      },
    },
  });

  if (existingCode) {
    throw new ConflictError(
      `Assumption code '${validated.code}' already exists in plan version '${validated.planVersionId}'`
    );
  }

  // Validate optional foreign keys
  if (validated.plantId) {
    const plant = await db.plant.findFirst({ where: { id: validated.plantId, organizationId: orgId } });
    if (!plant) throw new ValidationError(`Plant '${validated.plantId}' not found in organization`);
  }

  if (validated.productId) {
    const product = await db.product.findFirst({ where: { id: validated.productId, organizationId: orgId } });
    if (!product) throw new ValidationError(`Product '${validated.productId}' not found in organization`);
  }

  if (validated.accountId) {
    const account = await db.account.findFirst({ where: { id: validated.accountId, organizationId: orgId } });
    if (!account) throw new ValidationError(`Account '${validated.accountId}' not found in organization`);
  }

  const created = await db.assumption.create({
    data: {
      organizationId: orgId,
      planningCycleId: validated.planningCycleId,
      planVersionId: validated.planVersionId,
      name: validated.name,
      code: validated.code,
      description: validated.description,
      category: validated.category,
      valueType: validated.valueType,
      numericValue: validated.numericValue ?? null,
      textValue: validated.textValue ?? null,
      booleanValue: validated.booleanValue ?? null,
      dateValue: validated.dateValue ? new Date(validated.dateValue) : null,
      unit: validated.unit,
      currency: validated.currency || 'USD',
      effectiveFromPeriodId: validated.effectiveFromPeriodId,
      effectiveToPeriodId: validated.effectiveToPeriodId,
      plantId: validated.plantId,
      productId: validated.productId,
      accountId: validated.accountId,
      source: validated.source,
      confidenceLevel: validated.confidenceLevel,
      status: validated.status,
      notes: validated.notes,
      createdById: userId,
      updatedById: userId,
    },
    include: {
      effectiveFromPeriod: true,
      effectiveToPeriod: true,
      plant: true,
      product: true,
      account: true,
    },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'ASSUMPTION_CREATED',
    entityType: 'Assumption',
    entityId: created.id,
    metadata: {
      code: created.code,
      name: created.name,
      category: created.category,
      valueType: created.valueType,
      versionId: created.planVersionId,
    },
  });

  return created;
}

export async function updateAssumption(
  orgId: string,
  userId: string,
  assumptionId: string,
  data: z.input<typeof updateAssumptionSchema>
) {
  const existing = await getAssumptionById(orgId, assumptionId);
  await verifyVersionIsEditable(orgId, existing.planVersionId);

  if (existing.status === 'LOCKED') {
    throw new ValidationError('Cannot edit a locked assumption');
  }

  const validated = updateAssumptionSchema.parse(data);

  const updated = await db.assumption.update({
    where: { id: assumptionId },
    data: {
      ...validated,
      dateValue: validated.dateValue !== undefined
        ? (validated.dateValue ? new Date(validated.dateValue) : null)
        : undefined,
      updatedById: userId,
    },
    include: {
      effectiveFromPeriod: true,
      effectiveToPeriod: true,
      plant: true,
      product: true,
      account: true,
    },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'ASSUMPTION_UPDATED',
    entityType: 'Assumption',
    entityId: assumptionId,
    metadata: { code: existing.code, changes: validated },
  });

  return updated;
}

export async function deleteAssumption(orgId: string, userId: string, assumptionId: string) {
  const existing = await getAssumptionById(orgId, assumptionId);
  await verifyVersionIsEditable(orgId, existing.planVersionId);

  if (existing.status === 'APPROVED' || existing.status === 'LOCKED') {
    throw new ValidationError(`Cannot delete an ${existing.status.toLowerCase()} assumption`);
  }

  await db.assumption.delete({ where: { id: assumptionId } });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'ASSUMPTION_DELETED',
    entityType: 'Assumption',
    entityId: assumptionId,
    metadata: { code: existing.code, name: existing.name, versionId: existing.planVersionId },
  });

  return { success: true };
}

export async function copyAssumptions(
  orgId: string,
  userId: string,
  input: z.input<typeof copyAssumptionsSchema>
) {
  const validated = copyAssumptionsSchema.parse(input);

  // Validate target version is editable
  const targetVersion = await verifyVersionIsEditable(orgId, validated.targetVersionId);

  // Source version must belong to same org
  const sourceVersion = await db.planVersion.findFirst({
    where: { id: validated.sourceVersionId, organizationId: orgId },
  });

  if (!sourceVersion) {
    throw new NotFoundError(`Source version '${validated.sourceVersionId}' not found`);
  }

  const sourceAssumptions = await db.assumption.findMany({
    where: { organizationId: orgId, planVersionId: validated.sourceVersionId },
  });

  let copiedCount = 0;
  let skippedCount = 0;
  let overwrittenCount = 0;

  await db.$transaction(async (tx) => {
    for (const item of sourceAssumptions) {
      const existing = await tx.assumption.findUnique({
        where: {
          planVersionId_code: {
            planVersionId: validated.targetVersionId,
            code: item.code,
          },
        },
      });

      if (existing) {
        if (validated.overwritePolicy === 'OVERWRITE') {
          await tx.assumption.update({
            where: { id: existing.id },
            data: {
              name: item.name,
              description: item.description,
              category: item.category,
              valueType: item.valueType,
              numericValue: item.numericValue,
              textValue: item.textValue,
              booleanValue: item.booleanValue,
              dateValue: item.dateValue,
              unit: item.unit,
              currency: item.currency,
              effectiveFromPeriodId: item.effectiveFromPeriodId,
              effectiveToPeriodId: item.effectiveToPeriodId,
              plantId: item.plantId,
              productId: item.productId,
              accountId: item.accountId,
              source: `Copied from ${sourceVersion.versionCode}`,
              confidenceLevel: item.confidenceLevel,
              notes: item.notes,
              status: 'DRAFT',
              updatedById: userId,
            },
          });
          overwrittenCount++;
        } else {
          skippedCount++;
        }
      } else {
        await tx.assumption.create({
          data: {
            organizationId: orgId,
            planningCycleId: targetVersion.planningCycleId,
            planVersionId: validated.targetVersionId,
            name: item.name,
            code: item.code,
            description: item.description,
            category: item.category,
            valueType: item.valueType,
            numericValue: item.numericValue,
            textValue: item.textValue,
            booleanValue: item.booleanValue,
            dateValue: item.dateValue,
            unit: item.unit,
            currency: item.currency,
            effectiveFromPeriodId: item.effectiveFromPeriodId,
            effectiveToPeriodId: item.effectiveToPeriodId,
            plantId: item.plantId,
            productId: item.productId,
            accountId: item.accountId,
            source: `Copied from ${sourceVersion.versionCode}`,
            confidenceLevel: item.confidenceLevel,
            notes: item.notes,
            status: 'DRAFT',
            createdById: userId,
            updatedById: userId,
          },
        });
        copiedCount++;
      }
    }
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'ASSUMPTIONS_COPIED',
    entityType: 'PlanVersion',
    entityId: validated.targetVersionId,
    metadata: {
      sourceVersionId: validated.sourceVersionId,
      sourceVersionCode: sourceVersion.versionCode,
      targetVersionId: validated.targetVersionId,
      targetVersionCode: targetVersion.versionCode,
      copiedCount,
      overwrittenCount,
      skippedCount,
      policy: validated.overwritePolicy,
    },
  });

  return { copiedCount, overwrittenCount, skippedCount };
}
