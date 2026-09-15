import { db } from '@/lib/db';
import { recordAuditLog } from '@/lib/audit';
import { NotFoundError, ValidationError } from '@/core/errors/AppError';
import { versionCopySchema } from '@/lib/validations/plan-inputs';
import { z } from 'zod';

export async function copyVersionData(
  orgId: string,
  userId: string,
  input: z.input<typeof versionCopySchema>
) {
  const validated = versionCopySchema.parse(input);

  // Source and Target must belong to this organization
  const sourceVersion = await db.planVersion.findFirst({
    where: { id: validated.sourceVersionId, organizationId: orgId },
  });
  if (!sourceVersion) {
    throw new NotFoundError(`Source plan version '${validated.sourceVersionId}' not found`);
  }

  const targetVersion = await db.planVersion.findFirst({
    where: { id: validated.targetVersionId, organizationId: orgId },
  });
  if (!targetVersion) {
    throw new NotFoundError(`Target plan version '${validated.targetVersionId}' not found`);
  }

  if (targetVersion.status === 'APPROVED' || targetVersion.status === 'LOCKED') {
    throw new ValidationError(
      `Cannot copy into target plan version '${targetVersion.versionCode}' because its status is ${targetVersion.status}`
    );
  }

  const counts = {
    targetsCopied: 0,
    targetsSkipped: 0,
    assumptionsCopied: 0,
    assumptionsSkipped: 0,
    driversCopied: 0,
    driversSkipped: 0,
    inputsCopied: 0,
    inputsSkipped: 0,
  };

  await db.$transaction(async (tx) => {
    // 1. Copy Targets
    if (validated.categories.includes('TARGETS')) {
      const sourceTargets = await tx.managementTarget.findMany({
        where: { organizationId: orgId, planVersionId: validated.sourceVersionId },
      });

      for (const st of sourceTargets) {
        const existing = await tx.managementTarget.findFirst({
          where: {
            planVersionId: validated.targetVersionId,
            fiscalPeriodId: st.fiscalPeriodId,
            targetMetric: st.targetMetric,
            plantId: st.plantId,
            productId: st.productId,
            accountId: st.accountId,
          },
        });

        if (existing) {
          if (validated.overwritePolicy === 'OVERWRITE') {
            await tx.managementTarget.update({
              where: { id: existing.id },
              data: {
                targetValue: st.targetValue,
                unitOfMeasure: st.unitOfMeasure,
                currency: st.currency,
                sourceType: 'PRIOR_PLAN_VERSION',
                sourceReference: `Copied from ${sourceVersion.versionCode}`,
                notes: st.notes,
                updatedById: userId,
              },
            });
            counts.targetsCopied++;
          } else {
            counts.targetsSkipped++;
          }
        } else {
          await tx.managementTarget.create({
            data: {
              organizationId: orgId,
              planningCycleId: targetVersion.planningCycleId,
              planVersionId: validated.targetVersionId,
              fiscalPeriodId: st.fiscalPeriodId,
              plantId: st.plantId,
              productId: st.productId,
              accountId: st.accountId,
              targetMetric: st.targetMetric,
              targetValue: st.targetValue,
              unitOfMeasure: st.unitOfMeasure,
              currency: st.currency,
              sourceType: 'PRIOR_PLAN_VERSION',
              sourceReference: `Copied from ${sourceVersion.versionCode}`,
              notes: st.notes,
              status: 'DRAFT',
              createdById: userId,
              updatedById: userId,
            },
          });
          counts.targetsCopied++;
        }
      }
    }

    // 2. Copy Assumptions
    if (validated.categories.includes('ASSUMPTIONS')) {
      const sourceAssumptions = await tx.assumption.findMany({
        where: { organizationId: orgId, planVersionId: validated.sourceVersionId },
      });

      for (const sa of sourceAssumptions) {
        const existing = await tx.assumption.findUnique({
          where: {
            planVersionId_code: {
              planVersionId: validated.targetVersionId,
              code: sa.code,
            },
          },
        });

        if (existing) {
          if (validated.overwritePolicy === 'OVERWRITE') {
            await tx.assumption.update({
              where: { id: existing.id },
              data: {
                name: sa.name,
                description: sa.description,
                category: sa.category,
                valueType: sa.valueType,
                numericValue: sa.numericValue,
                textValue: sa.textValue,
                booleanValue: sa.booleanValue,
                dateValue: sa.dateValue,
                unit: sa.unit,
                currency: sa.currency,
                effectiveFromPeriodId: sa.effectiveFromPeriodId,
                effectiveToPeriodId: sa.effectiveToPeriodId,
                plantId: sa.plantId,
                productId: sa.productId,
                accountId: sa.accountId,
                source: `Copied from ${sourceVersion.versionCode}`,
                confidenceLevel: sa.confidenceLevel,
                notes: sa.notes,
                updatedById: userId,
              },
            });
            counts.assumptionsCopied++;
          } else {
            counts.assumptionsSkipped++;
          }
        } else {
          await tx.assumption.create({
            data: {
              organizationId: orgId,
              planningCycleId: targetVersion.planningCycleId,
              planVersionId: validated.targetVersionId,
              name: sa.name,
              code: sa.code,
              description: sa.description,
              category: sa.category,
              valueType: sa.valueType,
              numericValue: sa.numericValue,
              textValue: sa.textValue,
              booleanValue: sa.booleanValue,
              dateValue: sa.dateValue,
              unit: sa.unit,
              currency: sa.currency,
              effectiveFromPeriodId: sa.effectiveFromPeriodId,
              effectiveToPeriodId: sa.effectiveToPeriodId,
              plantId: sa.plantId,
              productId: sa.productId,
              accountId: sa.accountId,
              source: `Copied from ${sourceVersion.versionCode}`,
              confidenceLevel: sa.confidenceLevel,
              notes: sa.notes,
              status: 'DRAFT',
              createdById: userId,
              updatedById: userId,
            },
          });
          counts.assumptionsCopied++;
        }
      }
    }

    // 3. Copy Driver Values
    if (validated.categories.includes('DRIVERS')) {
      const sourceDrivers = await tx.planDriverValue.findMany({
        where: { organizationId: orgId, planVersionId: validated.sourceVersionId },
      });

      for (const sd of sourceDrivers) {
        const existing = await tx.planDriverValue.findFirst({
          where: {
            organizationId: orgId,
            planVersionId: validated.targetVersionId,
            driverId: sd.driverId,
            fiscalPeriodId: sd.fiscalPeriodId,
            plantId: sd.plantId,
            productId: sd.productId,
          },
        });

        if (existing) {
          if (validated.overwritePolicy === 'OVERWRITE') {
            await tx.planDriverValue.update({
              where: { id: existing.id },
              data: {
                driverValue: sd.driverValue,
                isOverridden: sd.isOverridden,
                overrideReason: sd.overrideReason,
                notes: sd.notes,
                updatedById: userId,
              },
            });
            counts.driversCopied++;
          } else {
            counts.driversSkipped++;
          }
        } else {
          await tx.planDriverValue.create({
            data: {
              organizationId: orgId,
              planVersionId: validated.targetVersionId,
              driverId: sd.driverId,
              fiscalPeriodId: sd.fiscalPeriodId,
              plantId: sd.plantId,
              productId: sd.productId,
              driverValue: sd.driverValue,
              isOverridden: sd.isOverridden,
              overrideReason: sd.overrideReason,
              status: 'DRAFT',
              notes: sd.notes,
              createdById: userId,
              updatedById: userId,
            },
          });
          counts.driversCopied++;
        }
      }
    }

    // 4. Copy Plan Inputs
    if (validated.categories.includes('INPUTS')) {
      const sourceInputs = await tx.planInput.findMany({
        where: { organizationId: orgId, planVersionId: validated.sourceVersionId },
      });

      for (const si of sourceInputs) {
        const existing = await tx.planInput.findFirst({
          where: {
            organizationId: orgId,
            planVersionId: validated.targetVersionId,
            fiscalPeriodId: si.fiscalPeriodId,
            inputCategory: si.inputCategory,
            inputCode: si.inputCode,
            plantId: si.plantId,
            productId: si.productId,
            materialId: si.materialId,
            accountId: si.accountId,
          },
        });

        if (existing) {
          if (validated.overwritePolicy === 'OVERWRITE') {
            await tx.planInput.update({
              where: { id: existing.id },
              data: {
                inputValue: si.inputValue,
                unitOfMeasure: si.unitOfMeasure,
                currency: si.currency,
                sourceType: 'PRIOR_PLAN_VERSION',
                sourceReference: `Copied from ${sourceVersion.versionCode}`,
                isOverridden: si.isOverridden,
                overrideReason: si.overrideReason,
                notes: si.notes,
                updatedById: userId,
              },
            });
            counts.inputsCopied++;
          } else {
            counts.inputsSkipped++;
          }
        } else {
          await tx.planInput.create({
            data: {
              organizationId: orgId,
              planningCycleId: targetVersion.planningCycleId,
              planVersionId: validated.targetVersionId,
              fiscalPeriodId: si.fiscalPeriodId,
              plantId: si.plantId,
              productId: si.productId,
              materialId: si.materialId,
              accountId: si.accountId,
              driverId: si.driverId,
              inputCategory: si.inputCategory,
              inputCode: si.inputCode,
              inputValue: si.inputValue,
              unitOfMeasure: si.unitOfMeasure,
              currency: si.currency,
              sourceType: 'PRIOR_PLAN_VERSION',
              sourceReference: `Copied from ${sourceVersion.versionCode}`,
              isOverridden: si.isOverridden,
              overrideReason: si.overrideReason,
              status: 'DRAFT',
              notes: si.notes,
              createdById: userId,
              updatedById: userId,
            },
          });
          counts.inputsCopied++;
        }
      }
    }

    const totalRecords =
      counts.targetsCopied +
      counts.assumptionsCopied +
      counts.driversCopied +
      counts.inputsCopied;

    // Create VersionCopyLog
    await tx.versionCopyLog.create({
      data: {
        organizationId: orgId,
        sourceVersionId: validated.sourceVersionId,
        targetVersionId: validated.targetVersionId,
        categoriesCopied: JSON.stringify(validated.categories),
        overwritePolicy: validated.overwritePolicy,
        recordsCount: totalRecords,
        copiedById: userId,
      },
    });
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'VERSION_DATA_COPIED',
    entityType: 'PlanVersion',
    entityId: validated.targetVersionId,
    metadata: {
      sourceVersionId: validated.sourceVersionId,
      sourceVersionCode: sourceVersion.versionCode,
      targetVersionId: validated.targetVersionId,
      targetVersionCode: targetVersion.versionCode,
      categories: validated.categories,
      counts,
      policy: validated.overwritePolicy,
    },
  });

  return { success: true, counts };
}
