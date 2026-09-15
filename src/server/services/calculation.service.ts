/**
 * Calculation Management Domain Service
 * High-level orchestration for readiness evaluation, execution, run history, and outputs
 */

import { db } from '@/lib/db';
import { resolveInputSnapshot } from '@/financial-engine/adapters/input-resolver';
import { evaluateInputReadiness, ReadinessReport } from '@/financial-engine/validation/readiness';
import { createCalculationContext } from '@/financial-engine/pipeline/calculation-context';
import { CalculationRunner, CalculationPipelineResult } from '@/financial-engine/pipeline/calculation-runner';
import { persistCalculationRun } from '@/financial-engine/persistence/run-store';
import { CalculationRunStatus } from '@/financial-engine/domain/enums';
import { NotFoundError, ValidationError, ConflictError } from '@/core/errors/AppError';
import { PlanLockedError } from '@/financial-engine/domain/errors';

export interface ExecuteCalculationParams {
  planningCycleId: string;
  planVersionId: string;
  fiscalPeriodId: string;
  plantId: string;
  productId: string;
  allowWarnings?: boolean;
}

export async function checkReadiness(
  organizationId: string,
  params: {
    planningCycleId: string;
    planVersionId: string;
    fiscalPeriodId: string;
    plantId: string;
    productId: string;
  }
): Promise<{ report: ReadinessReport; snapshotHash: string; currency: string }> {
  const version = await db.planVersion.findFirst({
    where: { id: params.planVersionId, organizationId },
  });
  if (!version) {
    throw new NotFoundError('Plan Version not found');
  }

  const snapshot = await resolveInputSnapshot({
    organizationId,
    planningCycleId: params.planningCycleId,
    planVersionId: params.planVersionId,
    fiscalPeriodId: params.fiscalPeriodId,
    plantId: params.plantId,
    productId: params.productId,
  });

  const report = evaluateInputReadiness(snapshot, version.status);
  return {
    report,
    snapshotHash: snapshot.snapshotHash,
    currency: snapshot.currency,
  };
}

export async function executeCalculation(
  organizationId: string,
  userId: string,
  params: ExecuteCalculationParams
): Promise<CalculationPipelineResult> {
  // 1. Verify Plan Version is not locked
  const version = await db.planVersion.findFirst({
    where: { id: params.planVersionId, organizationId },
  });
  if (!version) {
    throw new NotFoundError('Plan Version not found');
  }
  if (version.status === 'LOCKED') {
    throw new PlanLockedError(version.id, version.status);
  }

  // 2. Concurrency guard: Check for active RUNNING job
  const activeRun = await db.calculationRun.findFirst({
    where: {
      organizationId,
      planVersionId: params.planVersionId,
      fiscalPeriodId: params.fiscalPeriodId,
      plantId: params.plantId,
      productId: params.productId,
      status: CalculationRunStatus.RUNNING,
      startedAt: {
        gte: new Date(Date.now() - 2 * 60 * 1000), // within last 2 mins
      },
    },
  });
  if (activeRun) {
    throw new ConflictError('A calculation is currently in progress for this version and period.');
  }

  // 3. Resolve Input Snapshot
  const snapshot = await resolveInputSnapshot({
    organizationId,
    planningCycleId: params.planningCycleId,
    planVersionId: params.planVersionId,
    fiscalPeriodId: params.fiscalPeriodId,
    plantId: params.plantId,
    productId: params.productId,
  });

  // 4. Build Context
  const context = createCalculationContext({
    organizationId,
    planningCycleId: params.planningCycleId,
    planVersionId: params.planVersionId,
    fiscalPeriodId: params.fiscalPeriodId,
    plantId: params.plantId,
    productId: params.productId,
    currency: snapshot.currency,
    userId,
  });

  // 5. Execute Pipeline
  const runner = new CalculationRunner();
  const result = await runner.execute(context, snapshot);

  // 6. Persist Results & Audit Trail
  await persistCalculationRun(context, snapshot, result);

  return result;
}

export async function getCalculationRuns(
  organizationId: string,
  filters: {
    planningCycleId?: string;
    planVersionId?: string;
    fiscalPeriodId?: string;
    plantId?: string;
    productId?: string;
    status?: string;
    limit?: number;
  }
) {
  return await db.calculationRun.findMany({
    where: {
      organizationId,
      planningCycleId: filters.planningCycleId,
      planVersionId: filters.planVersionId,
      fiscalPeriodId: filters.fiscalPeriodId,
      plantId: filters.plantId,
      productId: filters.productId,
      status: filters.status,
    },
    include: {
      startedByUser: { select: { id: true, name: true, email: true } },
      plant: { select: { id: true, code: true, name: true } },
      product: { select: { id: true, code: true, name: true } },
      fiscalPeriod: { select: { id: true, periodName: true, periodNumber: true } },
    },
    orderBy: { startedAt: 'desc' },
    take: filters.limit || 50,
  });
}

export async function getCalculationRunById(organizationId: string, runId: string) {
  const run = await db.calculationRun.findFirst({
    where: { id: runId, organizationId },
    include: {
      startedByUser: { select: { id: true, name: true, email: true } },
      planVersion: { select: { id: true, versionCode: true, versionName: true, status: true } },
      fiscalPeriod: { select: { id: true, periodName: true, periodNumber: true } },
      plant: { select: { id: true, code: true, name: true } },
      product: { select: { id: true, code: true, name: true } },
      outputs: {
        orderBy: [{ outputCategory: 'asc' }, { outputCode: 'asc' }],
      },
      validations: {
        orderBy: [{ severity: 'desc' }, { calculationStage: 'asc' }],
      },
    },
  });

  if (!run) {
    throw new NotFoundError('Calculation Run not found');
  }

  let parsedSummary = null;
  if (run.resultSummary) {
    try {
      parsedSummary = JSON.parse(run.resultSummary);
    } catch {
      // ignore
    }
  }

  return {
    ...run,
    summary: parsedSummary,
  };
}

export async function getLatestSuccessfulRun(
  organizationId: string,
  params: {
    planVersionId: string;
    fiscalPeriodId?: string;
    plantId?: string;
    productId?: string;
  }
) {
  const run = await db.calculationRun.findFirst({
    where: {
      organizationId,
      planVersionId: params.planVersionId,
      fiscalPeriodId: params.fiscalPeriodId,
      plantId: params.plantId,
      productId: params.productId,
      status: {
        in: [CalculationRunStatus.COMPLETED, CalculationRunStatus.COMPLETED_WITH_WARNINGS],
      },
    },
    include: {
      startedByUser: { select: { id: true, name: true, email: true } },
      outputs: true,
      validations: true,
    },
    orderBy: { completedAt: 'desc' },
  });

  if (!run) {
    return null;
  }

  let parsedSummary = null;
  if (run.resultSummary) {
    try {
      parsedSummary = JSON.parse(run.resultSummary);
    } catch {
      // ignore
    }
  }

  return {
    ...run,
    summary: parsedSummary,
  };
}

export async function retryCalculationRun(organizationId: string, userId: string, runId: string) {
  const originalRun = await db.calculationRun.findFirst({
    where: { id: runId, organizationId },
  });
  if (!originalRun) {
    throw new NotFoundError('Calculation Run to retry not found');
  }

  return await executeCalculation(organizationId, userId, {
    planningCycleId: originalRun.planningCycleId,
    planVersionId: originalRun.planVersionId,
    fiscalPeriodId: originalRun.fiscalPeriodId,
    plantId: originalRun.plantId || '',
    productId: originalRun.productId || '',
  });
}
