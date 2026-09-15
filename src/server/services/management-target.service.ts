import { db } from '@/lib/db';
import { recordAuditLog } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/core/errors/AppError';
import {
  createManagementTargetSchema,
  updateManagementTargetSchema,
  updateTargetStatusSchema,
  bulkTargetImportSchema,
} from '@/lib/validations/targets';
import { z } from 'zod';

export interface TargetFilters {
  planningCycleId?: string;
  planVersionId?: string;
  fiscalPeriodId?: string;
  plantId?: string;
  productId?: string;
  accountId?: string;
  targetMetric?: string;
  status?: string;
}

export async function getTargets(orgId: string, filters: TargetFilters) {
  const where: Record<string, unknown> = { organizationId: orgId };

  if (filters.planningCycleId) where.planningCycleId = filters.planningCycleId;
  if (filters.planVersionId) where.planVersionId = filters.planVersionId;
  if (filters.fiscalPeriodId) where.fiscalPeriodId = filters.fiscalPeriodId;
  if (filters.plantId) where.plantId = filters.plantId;
  if (filters.productId) where.productId = filters.productId;
  if (filters.accountId) where.accountId = filters.accountId;
  if (filters.targetMetric) where.targetMetric = filters.targetMetric;
  if (filters.status) where.status = filters.status;

  return db.managementTarget.findMany({
    where,
    orderBy: [{ fiscalPeriod: { periodNumber: 'asc' } }, { targetMetric: 'asc' }],
    include: {
      fiscalPeriod: { select: { id: true, periodName: true, periodNumber: true, fiscalYear: true, quarter: true } },
      plant: { select: { id: true, code: true, name: true } },
      product: { select: { id: true, code: true, name: true, category: true } },
      account: { select: { id: true, code: true, name: true, accountType: true } },
      createdByUser: { select: { id: true, name: true, email: true } },
      planVersion: { select: { id: true, versionCode: true, versionName: true, status: true } },
    },
  });
}

export async function getTargetById(orgId: string, targetId: string) {
  const target = await db.managementTarget.findFirst({
    where: { id: targetId, organizationId: orgId },
    include: {
      fiscalPeriod: true,
      plant: true,
      product: true,
      account: true,
      planVersion: true,
      createdByUser: { select: { id: true, name: true, email: true } },
      updatedByUser: { select: { id: true, name: true, email: true } },
    },
  });

  if (!target) {
    throw new NotFoundError(`Management target '${targetId}' not found`);
  }

  return target;
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
      `Cannot modify management targets for an ${version.status.toLowerCase()} plan version due to financial audit immutability`
    );
  }

  return version;
}

export async function createTarget(
  orgId: string,
  userId: string,
  data: z.input<typeof createManagementTargetSchema>
) {
  const validated = createManagementTargetSchema.parse(data);

  // Enforce version editability
  await verifyVersionIsEditable(orgId, validated.planVersionId);

  // Validate foreign keys exist in this organization
  const period = await db.fiscalPeriod.findFirst({
    where: { id: validated.fiscalPeriodId, fiscalCalendar: { organizationId: orgId } },
  });
  if (!period) {
    throw new ValidationError(`Fiscal period '${validated.fiscalPeriodId}' does not exist in this organization`);
  }

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

  // Prevent duplicate target records at the exact same dimensional grain
  const duplicate = await db.managementTarget.findFirst({
    where: {
      planVersionId: validated.planVersionId,
      fiscalPeriodId: validated.fiscalPeriodId,
      targetMetric: validated.targetMetric,
      plantId: validated.plantId || null,
      productId: validated.productId || null,
      accountId: validated.accountId || null,
    },
  });

  if (duplicate) {
    throw new ConflictError(
      `A target for metric '${validated.targetMetric}' already exists at this dimensional grain for the specified period and version`
    );
  }

  const created = await db.managementTarget.create({
    data: {
      organizationId: orgId,
      planningCycleId: validated.planningCycleId,
      planVersionId: validated.planVersionId,
      fiscalPeriodId: validated.fiscalPeriodId,
      plantId: validated.plantId || null,
      productId: validated.productId || null,
      accountId: validated.accountId || null,
      targetMetric: validated.targetMetric,
      targetValue: validated.targetValue,
      unitOfMeasure: validated.unitOfMeasure,
      currency: validated.currency || 'USD',
      sourceType: validated.sourceType,
      sourceReference: validated.sourceReference,
      notes: validated.notes,
      status: validated.status,
      createdById: userId,
      updatedById: userId,
    },
    include: {
      fiscalPeriod: true,
      plant: true,
      product: true,
      account: true,
    },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'TARGET_CREATED',
    entityType: 'ManagementTarget',
    entityId: created.id,
    metadata: {
      metric: created.targetMetric,
      value: created.targetValue,
      periodId: created.fiscalPeriodId,
      versionId: created.planVersionId,
    },
  });

  return created;
}

export async function updateTarget(
  orgId: string,
  userId: string,
  targetId: string,
  data: z.input<typeof updateManagementTargetSchema>
) {
  const existing = await getTargetById(orgId, targetId);
  await verifyVersionIsEditable(orgId, existing.planVersionId);

  if (existing.status === 'LOCKED') {
    throw new ValidationError('Cannot edit a locked management target');
  }

  const validated = updateManagementTargetSchema.parse(data);

  const updated = await db.managementTarget.update({
    where: { id: targetId },
    data: {
      ...validated,
      updatedById: userId,
    },
    include: {
      fiscalPeriod: true,
      plant: true,
      product: true,
      account: true,
    },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'TARGET_UPDATED',
    entityType: 'ManagementTarget',
    entityId: targetId,
    metadata: { changes: validated },
  });

  return updated;
}

export async function updateTargetStatus(
  orgId: string,
  userId: string,
  targetId: string,
  data: z.infer<typeof updateTargetStatusSchema>
) {
  const existing = await getTargetById(orgId, targetId);
  const validated = updateTargetStatusSchema.parse(data);

  if (validated.status === 'REJECTED' && !validated.rejectionReason) {
    throw new ValidationError('A rejection reason is required when rejecting a management target');
  }

  const updated = await db.managementTarget.update({
    where: { id: targetId },
    data: {
      status: validated.status,
      notes: validated.rejectionReason
        ? `Rejected: ${validated.rejectionReason}. ${existing.notes || ''}`.trim()
        : existing.notes,
      updatedById: userId,
    },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'TARGET_STATUS_UPDATED',
    entityType: 'ManagementTarget',
    entityId: targetId,
    metadata: {
      previousStatus: existing.status,
      newStatus: validated.status,
      reason: validated.rejectionReason || null,
    },
  });

  return updated;
}

export async function deleteTarget(orgId: string, userId: string, targetId: string) {
  const existing = await getTargetById(orgId, targetId);
  await verifyVersionIsEditable(orgId, existing.planVersionId);

  if (existing.status === 'APPROVED' || existing.status === 'LOCKED') {
    throw new ValidationError(`Cannot delete an ${existing.status.toLowerCase()} management target`);
  }

  await db.managementTarget.delete({ where: { id: targetId } });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'TARGET_DELETED',
    entityType: 'ManagementTarget',
    entityId: targetId,
    metadata: {
      metric: existing.targetMetric,
      value: existing.targetValue,
      periodId: existing.fiscalPeriodId,
    },
  });

  return { success: true };
}

export async function bulkImportTargets(
  orgId: string,
  userId: string,
  input: z.input<typeof bulkTargetImportSchema>,
  commit: boolean = false
) {
  const validated = bulkTargetImportSchema.parse(input);
  await verifyVersionIsEditable(orgId, validated.planVersionId);

  const report = {
    fileName: validated.fileName,
    totalRows: validated.rows.length,
    validRows: 0,
    invalidRows: 0,
    errors: [] as Array<{ row: number; error: string; data?: Record<string, unknown> }>,
    preview: [] as Array<Record<string, unknown>>,
  };

  const validDataToInsert: Array<Record<string, unknown>> = [];

  for (let idx = 0; idx < validated.rows.length; idx++) {
    const row = validated.rows[idx];
    const rowNumber = idx + 1;

    try {
      // Validate period
      const period = await db.fiscalPeriod.findFirst({
        where: { id: row.fiscalPeriodId, fiscalCalendar: { organizationId: orgId } },
      });
      if (!period) {
        throw new ValidationError(`Invalid fiscal period ID '${row.fiscalPeriodId}'`);
      }

      if (row.plantId) {
        const plant = await db.plant.findFirst({ where: { id: row.plantId, organizationId: orgId } });
        if (!plant) throw new ValidationError(`Plant '${row.plantId}' not found`);
      }

      if (row.productId) {
        const product = await db.product.findFirst({ where: { id: row.productId, organizationId: orgId } });
        if (!product) throw new ValidationError(`Product '${row.productId}' not found`);
      }

      if (row.accountId) {
        const account = await db.account.findFirst({ where: { id: row.accountId, organizationId: orgId } });
        if (!account) throw new ValidationError(`Account '${row.accountId}' not found`);
      }

      // Check boundary constraints
      if (row.targetMetric === 'GROSS_MARGIN_PERCENT' && (row.targetValue < -100 || row.targetValue > 100)) {
        throw new ValidationError('Gross margin percent must be between -100 and 100');
      }
      if (
        ['SALES_QUANTITY', 'PRODUCTION_QUANTITY', 'ENDING_INVENTORY', 'HEADCOUNT'].includes(row.targetMetric) &&
        row.targetValue < 0
      ) {
        throw new ValidationError(`${row.targetMetric} cannot be negative`);
      }

      report.validRows++;
      const item = {
        organizationId: orgId,
        planningCycleId: validated.planningCycleId,
        planVersionId: validated.planVersionId,
        fiscalPeriodId: row.fiscalPeriodId,
        plantId: row.plantId || null,
        productId: row.productId || null,
        accountId: row.accountId || null,
        targetMetric: row.targetMetric,
        targetValue: row.targetValue,
        unitOfMeasure: row.unitOfMeasure,
        currency: row.currency || 'USD',
        sourceType: row.sourceType || 'CSV_IMPORT',
        sourceReference: row.sourceReference || validated.fileName,
        notes: row.notes || null,
        status: 'DRAFT',
        createdById: userId,
        updatedById: userId,
      };

      validDataToInsert.push(item);
      if (report.preview.length < 10) {
        report.preview.push(item);
      }
    } catch (err: unknown) {
      report.invalidRows++;
      report.errors.push({
        row: rowNumber,
        error: err instanceof Error ? err.message : 'Validation failed',
        data: row as unknown as Record<string, unknown>,
      });
    }
  }

  if (commit) {
    if (report.invalidRows > 0) {
      throw new ValidationError(
        `Import rejected: ${report.invalidRows} row(s) failed validation. Clean up errors before committing.`
      );
    }

    // Transactional batch insert
    await db.$transaction(async (tx) => {
      // Create ImportBatch record
      const batch = await tx.importBatch.create({
        data: {
          organizationId: orgId,
          planVersionId: validated.planVersionId,
          entityType: 'MANAGEMENT_TARGET',
          fileName: validated.fileName,
          totalRows: report.totalRows,
          validRows: report.validRows,
          invalidRows: report.invalidRows,
          status: 'COMPLETED',
          importedById: userId,
        },
      });

      for (const item of validDataToInsert) {
        // Upsert by dimensional grain
        const existing = await tx.managementTarget.findFirst({
          where: {
            planVersionId: item.planVersionId as string,
            fiscalPeriodId: item.fiscalPeriodId as string,
            targetMetric: item.targetMetric as string,
            plantId: (item.plantId as string) || null,
            productId: (item.productId as string) || null,
            accountId: (item.accountId as string) || null,
          },
        });

        if (existing) {
          await tx.managementTarget.update({
            where: { id: existing.id },
            data: {
              targetValue: item.targetValue as number,
              unitOfMeasure: item.unitOfMeasure as string,
              sourceReference: `Batch:${batch.id} (${validated.fileName})`,
              updatedById: userId,
            },
          });
        } else {
          await tx.managementTarget.create({
            data: {
              ...item,
              sourceReference: `Batch:${batch.id} (${validated.fileName})`,
            } as any,
          });
        }
      }
    });

    await recordAuditLog({
      organizationId: orgId,
      userId,
      action: 'TARGETS_BULK_IMPORTED',
      entityType: 'ManagementTarget',
      metadata: {
        fileName: validated.fileName,
        importedCount: validDataToInsert.length,
        versionId: validated.planVersionId,
      },
    });
  }

  return report;
}
