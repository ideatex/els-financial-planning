/**
 * Calculation Run & Output Persistence Store
 */

import { db } from '@/lib/db';
import { CalculationContext } from '../domain/types/context.types';
import { InputSnapshot } from '../domain/types/snapshot.types';
import { CalculationPipelineResult } from '../pipeline/calculation-runner';
import { recordAuditLog } from '@/lib/audit';

export async function persistCalculationRun(
  context: CalculationContext,
  snapshot: InputSnapshot,
  result: CalculationPipelineResult
): Promise<string> {
  const runId = await db.$transaction(async (tx) => {
    // 1. Upsert Calculation Snapshot
    let snapshotRecord = await tx.calculationSnapshot.findFirst({
      where: {
        organizationId: context.organizationId,
        snapshotHash: snapshot.snapshotHash,
      },
    });

    if (!snapshotRecord) {
      snapshotRecord = await tx.calculationSnapshot.create({
        data: {
          id: snapshot.snapshotId,
          organizationId: context.organizationId,
          planVersionId: context.planVersionId,
          fiscalPeriodId: context.fiscalPeriodId,
          plantId: context.plantId,
          productId: context.productId,
          snapshotHash: snapshot.snapshotHash,
          payload: JSON.stringify(snapshot),
        },
      });
    }

    // 2. Create Calculation Run Record
    const runRecord = await tx.calculationRun.create({
      data: {
        id: context.calculationRunId,
        organizationId: context.organizationId,
        planningCycleId: context.planningCycleId,
        planVersionId: context.planVersionId,
        fiscalPeriodId: context.fiscalPeriodId,
        plantId: context.plantId,
        productId: context.productId,
        status: result.status,
        startedById: context.userId,
        startedAt: context.timestamp,
        completedAt: new Date(),
        durationMs: result.durationMs,
        engineVersion: result.engineVersion,
        snapshotId: snapshotRecord.id,
        errorCount: result.errorCount,
        warningCount: result.warningCount,
        resultSummary: JSON.stringify(result.summary),
        failureReason: result.failureReason,
      },
    });

    // 3. Persist Financial Outputs
    if (result.outputs.length > 0) {
      await tx.financialOutput.createMany({
        data: result.outputs.map((out) => ({
          organizationId: context.organizationId,
          calculationRunId: runRecord.id,
          planningCycleId: context.planningCycleId,
          planVersionId: context.planVersionId,
          fiscalPeriodId: context.fiscalPeriodId,
          plantId: context.plantId,
          productId: context.productId,
          accountId: out.accountId ?? null,
          outputCategory: out.category,
          outputCode: out.code,
          outputValue: out.value,
          unitOfMeasure: out.unitOfMeasure,
          currency: out.currency,
          calculationStage: out.stage,
          formulaReference: out.formulaReference ?? null,
          sourceInputReferences: out.sourceInputReferences ?? null,
          lineage: out.lineage ?? null,
        })),
      });
    }

    // 4. Persist Validations
    if (result.validations.length > 0) {
      await tx.calculationValidation.createMany({
        data: result.validations.map((v) => ({
          calculationRunId: runRecord.id,
          code: v.code,
          severity: v.severity,
          message: v.message,
          calculationStage: v.calculationStage,
          entityType: v.entityType ?? null,
          entityId: v.entityId ?? null,
          field: v.field ?? null,
          suggestedResolution: v.suggestedResolution ?? null,
        })),
      });
    }

    return runRecord.id;
  }, {
    timeout: 30000,
    maxWait: 10000,
  });

  // 5. Emit Audit Log (outside transaction to avoid SQLite concurrency lock)
  await recordAuditLog({
    organizationId: context.organizationId,
    userId: context.userId,
    action: 'CALCULATION_EXECUTED',
    entityType: 'CalculationRun',
    entityId: runId,
    metadata: {
      planVersionId: context.planVersionId,
      fiscalPeriodId: context.fiscalPeriodId,
      status: result.status,
      durationMs: result.durationMs,
      revenue: result.summary.revenue,
      cogs: result.summary.cogs,
      operatingProfit: result.summary.operatingProfit,
      errorCount: result.errorCount,
      warningCount: result.warningCount,
    },
  });

  return runId;
}
