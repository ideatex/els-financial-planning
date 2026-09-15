/**
 * Forecasting Domain Service
 * Phase 6: Multi-period forecasting, rolling forecasts, period source classification,
 * deterministic calculation orchestration, and governance lifecycle.
 */

import { db } from '@/lib/db';
import { recordAuditLog } from '@/lib/audit';
import { FinancialDecimal } from '@/financial-engine/domain/decimal';
import { executeCalculation } from './calculation.service';
import { NotFoundError, BadRequestError, ConflictError, ForbiddenError } from '@/core/errors/AppError';
import { classifyFavorability, Favorability } from './variance.service';

export interface CreateForecastInput {
  name: string;
  code: string;
  description?: string;
  forecastType: 'ANNUAL_FORECAST' | 'MONTHLY_FORECAST' | 'QUARTERLY_FORECAST' | 'ROLLING_FORECAST' | 'REFORECAST' | 'SCENARIO_FORECAST';
  planningCycleId: string;
  basePlanVersionId: string;
  sourceForecastVersionId?: string;
  actualsCutoffPeriodId: string;
  forecastHorizonStartId: string;
  forecastHorizonEndId: string;
  forecastMethod: 'PLAN_BASED' | 'ACTUAL_RUN_RATE' | 'ACTUALS_PLUS_REMAINING_PLAN' | 'DRIVER_BASED' | 'PREVIOUS_FORECAST' | 'MANUAL_ADJUSTMENT';
  currency?: string;
  scenarioType?: 'BASE_CASE' | 'BEST_CASE' | 'WORST_CASE' | 'DOWNSIDE_CASE' | 'UPSIDE_CASE' | 'CUSTOM';
  metadata?: Record<string, unknown>;
}

export interface RollingForecastInput {
  sourceForecastVersionId: string;
  name: string;
  code: string;
  description?: string;
  advanceCutoffByPeriods?: number; // default 1
  extendHorizonByPeriods?: number; // default 1
}

export interface ForecastSummaryResult {
  forecastVersion: {
    id: string;
    versionCode: string;
    versionName: string;
    status: string;
    forecastType: string | null;
    forecastMethod: string | null;
    isLocked: boolean;
    isPublished: boolean;
  };
  periods: Array<{
    periodId: string;
    periodNumber: number;
    periodName: string;
    sourceType: 'ACTUAL' | 'FORECAST' | 'PLAN' | 'MANUAL_OVERRIDE' | 'UNAVAILABLE';
    actualsAvailable: boolean;
    forecastAvailable: boolean;
    revenue: number;
    cogs: number;
    grossProfit: number;
    opex: number;
    operatingProfit: number;
    salesUnits: number;
    productionUnits: number;
  }>;
  totals: {
    revenue: number;
    cogs: number;
    grossProfit: number;
    grossMarginPercent: number;
    opex: number;
    operatingProfit: number;
    operatingMarginPercent: number;
    salesUnits: number;
    productionUnits: number;
    actualPeriodsCount: number;
    forecastPeriodsCount: number;
  };
}

/**
 * 1. Create a new Forecast Version
 */
export async function createForecastVersion(
  orgId: string,
  userId: string,
  input: CreateForecastInput
) {
  // 1. Verify Planning Cycle
  const cycle = await db.planningCycle.findFirst({
    where: { id: input.planningCycleId, organizationId: orgId },
  });
  if (!cycle) {
    throw new NotFoundError(`Planning cycle '${input.planningCycleId}' not found.`);
  }

  // 2. Verify Base Plan Version
  const basePlan = await db.planVersion.findFirst({
    where: { id: input.basePlanVersionId, organizationId: orgId },
  });
  if (!basePlan) {
    throw new NotFoundError(`Base plan version '${input.basePlanVersionId}' not found.`);
  }

  // 3. Verify Periods
  const [cutoffPeriod, startPeriod, endPeriod] = await Promise.all([
    db.fiscalPeriod.findUnique({ where: { id: input.actualsCutoffPeriodId } }),
    db.fiscalPeriod.findUnique({ where: { id: input.forecastHorizonStartId } }),
    db.fiscalPeriod.findUnique({ where: { id: input.forecastHorizonEndId } }),
  ]);

  if (!cutoffPeriod) throw new NotFoundError(`Cutoff period '${input.actualsCutoffPeriodId}' not found.`);
  if (!startPeriod) throw new NotFoundError(`Horizon start period '${input.forecastHorizonStartId}' not found.`);
  if (!endPeriod) throw new NotFoundError(`Horizon end period '${input.forecastHorizonEndId}' not found.`);

  if (startPeriod.periodNumber > endPeriod.periodNumber) {
    throw new BadRequestError('Forecast horizon start period must not be after end period.');
  }

  // Check unique code within cycle
  const existingCode = await db.planVersion.findFirst({
    where: { planningCycleId: input.planningCycleId, versionCode: input.code },
  });
  if (existingCode) {
    throw new ConflictError(`Forecast with code '${input.code}' already exists in this planning cycle.`);
  }

  // 4. Create PlanVersion with forecast fields
  const forecast = await db.planVersion.create({
    data: {
      organizationId: orgId,
      planningCycleId: input.planningCycleId,
      versionCode: input.code,
      versionName: input.name,
      description: input.description ?? null,
      versionType: 'FORECAST',
      forecastType: input.forecastType,
      actualsCutoffPeriodId: input.actualsCutoffPeriodId,
      forecastHorizonStartId: input.forecastHorizonStartId,
      forecastHorizonEndId: input.forecastHorizonEndId,
      forecastMethod: input.forecastMethod,
      sourceForecastVersionId: input.sourceForecastVersionId ?? null,
      basePlanVersionId: input.basePlanVersionId,
      scenarioType: input.scenarioType ?? 'BASE_CASE',
      status: 'DRAFT',
      isBaseline: !input.scenarioType || input.scenarioType === 'BASE_CASE',
      isPublished: false,
      isLocked: false,
      createdById: userId,
      forecastMetadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });

  // 5. Initialize Period Classifications
  await resolveForecastPeriods(orgId, forecast.id);

  // 6. Pre-populate inputs based on methodology
  await executeForecastMethod(orgId, userId, forecast.id);

  // 7. Audit log
  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'FORECAST_VERSION_CREATED',
    entityType: 'PlanVersion',
    entityId: forecast.id,
    metadata: {
      versionCode: forecast.versionCode,
      forecastType: input.forecastType,
      forecastMethod: input.forecastMethod,
      cutoffPeriod: cutoffPeriod.periodName,
      basePlanVersionId: input.basePlanVersionId,
    },
  });

  return forecast;
}

/**
 * 2. Resolve Forecast Periods and Source Classifications
 */
export async function resolveForecastPeriods(orgId: string, forecastVersionId: string) {
  const forecast = await db.planVersion.findFirst({
    where: { id: forecastVersionId, organizationId: orgId },
    include: {
      actualsCutoffPeriod: true,
      forecastHorizonStart: true,
      forecastHorizonEnd: true,
      planningCycle: { include: { startPeriod: true, endPeriod: true } },
    },
  });

  if (!forecast) {
    throw new NotFoundError(`Forecast version '${forecastVersionId}' not found.`);
  }

  const cutoff = forecast.actualsCutoffPeriod;
  if (!cutoff) {
    throw new BadRequestError('Forecast is missing actuals cutoff period.');
  }

  // Fetch all periods in the fiscal calendar
  const periods = await db.fiscalPeriod.findMany({
    where: { fiscalCalendarId: cutoff.fiscalCalendarId },
    orderBy: { periodNumber: 'asc' },
  });

  const periodSourcesToUpsert = [];

  for (const period of periods) {
    const isPastOrCutoff = period.periodNumber <= cutoff.periodNumber;
    const sourceType: 'ACTUAL' | 'FORECAST' = isPastOrCutoff ? 'ACTUAL' : 'FORECAST';

    // Check if approved actuals exist for this period
    let actualsAvailable = false;
    let actualRevenue = 0;
    let actualCogs = 0;
    let actualOpex = 0;

    if (isPastOrCutoff) {
      const actualFinancials = await db.actualFinancialRecord.findMany({
        where: {
          organizationId: orgId,
          fiscalPeriodId: period.id,
          importBatch: { status: { in: ['IMPORTED', 'PARTIALLY_IMPORTED', 'LOCKED'] } },
        },
        include: { account: true },
      });

      if (actualFinancials.length > 0) {
        actualsAvailable = true;
        actualFinancials.forEach((r) => {
          const type = r.account?.accountType;
          const code = r.account?.code ?? '';
          if (type === 'REVENUE' || code.startsWith('4')) actualRevenue += r.amount;
          else if (type === 'COGS' || code.startsWith('5')) actualCogs += r.amount;
          else if (type === 'OPERATING_EXPENSE' || code.startsWith('6')) actualOpex += r.amount;
        });
      }
    }

    const actualNetProfit = actualRevenue - actualCogs - actualOpex;

    periodSourcesToUpsert.push({
      organizationId: orgId,
      planVersionId: forecast.id,
      fiscalPeriodId: period.id,
      periodNumber: period.periodNumber,
      sourceType,
      actualsAvailable,
      forecastAvailable: false,
      isLocked: isPastOrCutoff && actualsAvailable,
      actualRevenue: actualsAvailable ? actualRevenue : null,
      actualCogs: actualsAvailable ? actualCogs : null,
      actualOpex: actualsAvailable ? actualOpex : null,
      actualNetProfit: actualsAvailable ? actualNetProfit : null,
    });
  }

  // Upsert all period sources
  for (const p of periodSourcesToUpsert) {
    await db.forecastPeriodSource.upsert({
      where: {
        planVersionId_fiscalPeriodId: {
          planVersionId: p.planVersionId,
          fiscalPeriodId: p.fiscalPeriodId,
        },
      },
      create: p,
      update: {
        sourceType: p.sourceType,
        actualsAvailable: p.actualsAvailable,
        actualRevenue: p.actualRevenue,
        actualCogs: p.actualCogs,
        actualOpex: p.actualOpex,
        actualNetProfit: p.actualNetProfit,
        isLocked: p.isLocked,
      },
    });
  }

  return await db.forecastPeriodSource.findMany({
    where: { planVersionId: forecastVersionId, organizationId: orgId },
    include: { fiscalPeriod: true },
    orderBy: { periodNumber: 'asc' },
  });
}

/**
 * 3. Seed Inputs for Forecast Methodology
 */
export async function executeForecastMethod(orgId: string, userId: string, forecastVersionId: string) {
  const forecast = await db.planVersion.findFirst({
    where: { id: forecastVersionId, organizationId: orgId },
    include: {
      actualsCutoffPeriod: true,
      forecastPeriodSources: { include: { fiscalPeriod: true } },
    },
  });

  if (!forecast) throw new NotFoundError('Forecast version not found.');
  if (forecast.isLocked) throw new BadRequestError('Cannot modify inputs of a locked forecast.');

  const cutoffNumber = forecast.actualsCutoffPeriod?.periodNumber ?? 0;
  const method = forecast.forecastMethod ?? 'ACTUALS_PLUS_REMAINING_PLAN';

  // Identify future forecast periods
  const futurePeriodSources = forecast.forecastPeriodSources.filter(
    (ps) => ps.periodNumber > cutoffNumber
  );

  // A. PLAN_BASED or ACTUALS_PLUS_REMAINING_PLAN: Copy base plan inputs for remaining periods
  if (['PLAN_BASED', 'ACTUALS_PLUS_REMAINING_PLAN'].includes(method) && forecast.basePlanVersionId) {
    for (const fps of futurePeriodSources) {
      const baseInputs = await db.planInput.findMany({
        where: {
          organizationId: orgId,
          planVersionId: forecast.basePlanVersionId,
          fiscalPeriodId: fps.fiscalPeriodId,
        },
      });

      for (const bi of baseInputs) {
        await db.planInput.upsert({
          where: {
            id: `${forecast.id}-${bi.inputCode}-${fps.fiscalPeriodId}`,
          },
          create: {
            id: `${forecast.id}-${bi.inputCode}-${fps.fiscalPeriodId}`,
            organizationId: orgId,
            planningCycleId: forecast.planningCycleId,
            planVersionId: forecast.id,
            fiscalPeriodId: fps.fiscalPeriodId,
            plantId: bi.plantId,
            productId: bi.productId,
            materialId: bi.materialId,
            accountId: bi.accountId,
            inputCategory: bi.inputCategory,
            inputCode: bi.inputCode,
            inputValue: bi.inputValue,
            unitOfMeasure: bi.unitOfMeasure,
            currency: bi.currency,
            sourceType: 'PRIOR_PLAN_VERSION',
            sourceReference: `BasePlan:${forecast.basePlanVersionId}`,
            createdById: userId,
          },
          update: {
            inputValue: bi.inputValue,
            updatedById: userId,
          },
        });
      }
    }
  }

  // B. ACTUAL_RUN_RATE: Compute average monthly run-rate across completed actual periods
  if (method === 'ACTUAL_RUN_RATE') {
    const actualPeriods = forecast.forecastPeriodSources.filter(
      (ps) => ps.periodNumber <= cutoffNumber && ps.actualsAvailable
    );

    if (actualPeriods.length === 0) {
      throw new BadRequestError('Insufficient actual history: Actual Run-Rate requires at least one completed actual period.');
    }

    // Compute average monthly revenue, production, opex
    const avgRevenue = actualPeriods.reduce((sum, p) => sum + (p.actualRevenue ?? 0), 0) / actualPeriods.length;
    const avgCogs = actualPeriods.reduce((sum, p) => sum + (p.actualCogs ?? 0), 0) / actualPeriods.length;
    const avgOpex = actualPeriods.reduce((sum, p) => sum + (p.actualOpex ?? 0), 0) / actualPeriods.length;

    // Apply run rates as OPEX and baseline inputs for future periods
    for (const fps of futurePeriodSources) {
      if (avgOpex > 0) {
        await db.planInput.upsert({
          where: { id: `${forecast.id}-MONTHLY_OPEX-${fps.fiscalPeriodId}` },
          create: {
            id: `${forecast.id}-MONTHLY_OPEX-${fps.fiscalPeriodId}`,
            organizationId: orgId,
            planningCycleId: forecast.planningCycleId,
            planVersionId: forecast.id,
            fiscalPeriodId: fps.fiscalPeriodId,
            inputCategory: 'OPEX',
            inputCode: 'MONTHLY_OPEX',
            inputValue: avgOpex,
            unitOfMeasure: 'INR',
            sourceType: 'ACTUALS',
            sourceReference: `RunRate:${actualPeriods.length}Periods`,
            createdById: userId,
          },
          update: { inputValue: avgOpex, updatedById: userId },
        });
      }
    }
  }

  // C. PREVIOUS_FORECAST: Copy from source forecast version
  if (method === 'PREVIOUS_FORECAST' && forecast.sourceForecastVersionId) {
    const sourceInputs = await db.planInput.findMany({
      where: { organizationId: orgId, planVersionId: forecast.sourceForecastVersionId },
    });

    for (const si of sourceInputs) {
      await db.planInput.upsert({
        where: { id: `${forecast.id}-${si.inputCode}-${si.fiscalPeriodId}` },
        create: {
          id: `${forecast.id}-${si.inputCode}-${si.fiscalPeriodId}`,
          organizationId: orgId,
          planningCycleId: forecast.planningCycleId,
          planVersionId: forecast.id,
          fiscalPeriodId: si.fiscalPeriodId,
          plantId: si.plantId,
          productId: si.productId,
          materialId: si.materialId,
          inputCategory: si.inputCategory,
          inputCode: si.inputCode,
          inputValue: si.inputValue,
          unitOfMeasure: si.unitOfMeasure,
          currency: si.currency,
          sourceType: 'PRIOR_PLAN_VERSION',
          sourceReference: `SourceForecast:${forecast.sourceForecastVersionId}`,
          createdById: userId,
        },
        update: { inputValue: si.inputValue, updatedById: userId },
      });
    }
  }

  return { success: true, method };
}

/**
 * 4. Multi-Period Forecast Calculation Orchestration
 */
export async function calculateForecast(
  orgId: string,
  userId: string,
  forecastVersionId: string,
  params?: { plantId?: string; productId?: string }
): Promise<ForecastSummaryResult> {
  const forecast = await db.planVersion.findFirst({
    where: { id: forecastVersionId, organizationId: orgId },
    include: {
      actualsCutoffPeriod: true,
      forecastPeriodSources: { include: { fiscalPeriod: true }, orderBy: { periodNumber: 'asc' } },
    },
  });

  if (!forecast) throw new NotFoundError('Forecast version not found.');
  if (forecast.isLocked) throw new BadRequestError('Cannot calculate a locked forecast version.');

  // Set status to CALCULATING
  await db.planVersion.update({
    where: { id: forecast.id },
    data: { status: 'CALCULATING' },
  });

  const cutoffNumber = forecast.actualsCutoffPeriod?.periodNumber ?? 0;
  const plantId = params?.plantId ?? (await db.plant.findFirst({ where: { organizationId: orgId } }))?.id ?? '';
  const productId = params?.productId ?? (await db.product.findFirst({ where: { organizationId: orgId } }))?.id ?? '';

  let warningCount = 0;

  // Execute calculation engine for all future forecast periods
  for (const ps of forecast.forecastPeriodSources) {
    if (ps.periodNumber > cutoffNumber) {
      try {
        const calcRes = await executeCalculation(orgId, userId, {
          planningCycleId: forecast.planningCycleId,
          planVersionId: forecast.id,
          fiscalPeriodId: ps.fiscalPeriodId,
          plantId,
          productId,
        });

        // Update ForecastPeriodSource with calculated outputs
        const s = calcRes.summary;
        console.log(`CALC SUMMARY FOR PERIOD ${ps.periodNumber}:`, JSON.stringify(s));
        await db.forecastPeriodSource.update({
          where: { id: ps.id },
          data: {
            forecastAvailable: true,
            forecastRevenue: s.revenue,
            forecastCogs: s.cogs,
            forecastOpex: s.totalOpex,
            forecastNetProfit: s.operatingProfit,
          },
        });

        if (calcRes.warningCount > 0) warningCount += calcRes.warningCount;
      } catch (err: any) {
        console.error('CALC ERROR in calculateForecast:', err);
        warningCount++;
      }
    }
  }

  // Final status update
  const finalStatus = warningCount > 0 ? 'CALCULATION_WARNING' : 'CALCULATED';
  await db.planVersion.update({
    where: { id: forecast.id },
    data: { status: finalStatus },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'FORECAST_CALCULATED',
    entityType: 'PlanVersion',
    entityId: forecast.id,
    metadata: { status: finalStatus, warningCount },
  });

  return await getForecastSummary(orgId, forecast.id);
}

/**
 * 5. Retrieve Consolidated Forecast Summary
 */
export async function getForecastSummary(orgId: string, forecastVersionId: string): Promise<ForecastSummaryResult> {
  const forecast = await db.planVersion.findFirst({
    where: { id: forecastVersionId, organizationId: orgId },
    include: {
      actualsCutoffPeriod: true,
      forecastPeriodSources: { include: { fiscalPeriod: true }, orderBy: { periodNumber: 'asc' } },
    },
  });

  if (!forecast) throw new NotFoundError('Forecast version not found.');

  const cutoffNumber = forecast.actualsCutoffPeriod?.periodNumber ?? 0;

  let totalRev = 0;
  let totalCogs = 0;
  let totalOpex = 0;
  let totalSalesUnits = 0;
  let totalProdUnits = 0;
  let actualPeriodsCount = 0;
  let forecastPeriodsCount = 0;

  const periods = forecast.forecastPeriodSources.map((ps) => {
    const isActual = ps.periodNumber <= cutoffNumber;
    if (isActual) actualPeriodsCount++;
    else forecastPeriodsCount++;

    const rev = isActual ? (ps.actualRevenue ?? 0) : (ps.forecastRevenue ?? 0);
    const cogs = isActual ? (ps.actualCogs ?? 0) : (ps.forecastCogs ?? 0);
    const opex = isActual ? (ps.actualOpex ?? 0) : (ps.forecastOpex ?? 0);
    const gp = rev - cogs;
    const ebit = gp - opex;

    totalRev += rev;
    totalCogs += cogs;
    totalOpex += opex;

    // Read stored sales/production quantities from period source if available
    const salesUnits = (ps as any).forecastSalesQuantity ?? (ps as any).actualSalesQuantity ?? 0;
    const productionUnits = (ps as any).forecastProductionQuantity ?? (ps as any).actualProductionQuantity ?? 0;
    totalSalesUnits += salesUnits;
    totalProdUnits += productionUnits;

    return {
      periodId: ps.fiscalPeriodId,
      periodNumber: ps.periodNumber,
      periodName: ps.fiscalPeriod.periodName,
      sourceType: ps.sourceType as any,
      actualsAvailable: ps.actualsAvailable,
      forecastAvailable: ps.forecastAvailable,
      revenue: rev,
      cogs,
      grossProfit: gp,
      opex,
      operatingProfit: ebit,
      salesUnits,
      productionUnits,
    };
  });

  const totalGp = totalRev - totalCogs;
  const totalEbit = totalGp - totalOpex;
  const gmPct = totalRev > 0 ? (totalGp / totalRev) * 100 : 0;
  const omPct = totalRev > 0 ? (totalEbit / totalRev) * 100 : 0;

  return {
    forecastVersion: {
      id: forecast.id,
      versionCode: forecast.versionCode,
      versionName: forecast.versionName,
      status: forecast.status,
      forecastType: forecast.forecastType,
      forecastMethod: forecast.forecastMethod,
      isLocked: forecast.isLocked,
      isPublished: forecast.isPublished,
    },
    periods,
    totals: {
      revenue: totalRev,
      cogs: totalCogs,
      grossProfit: totalGp,
      grossMarginPercent: Math.round(gmPct * 100) / 100,
      opex: totalOpex,
      operatingProfit: totalEbit,
      operatingMarginPercent: Math.round(omPct * 100) / 100,
      salesUnits: totalSalesUnits,
      productionUnits: totalProdUnits,
      actualPeriodsCount,
      forecastPeriodsCount,
    },
  };
}

/**
 * 6. Rolling Forecast Horizon Advancement
 */
export async function createRollingForecast(
  orgId: string,
  userId: string,
  input: RollingForecastInput
) {
  const source = await db.planVersion.findFirst({
    where: { id: input.sourceForecastVersionId, organizationId: orgId },
    include: {
      actualsCutoffPeriod: true,
      forecastHorizonStart: true,
      forecastHorizonEnd: true,
    },
  });

  if (!source) throw new NotFoundError('Source forecast version not found.');
  if (!source.actualsCutoffPeriod) throw new BadRequestError('Source forecast has no actuals cutoff period.');

  const advanceCutoff = input.advanceCutoffByPeriods ?? 1;

  // Find next cutoff period in fiscal calendar
  const nextCutoff = await db.fiscalPeriod.findFirst({
    where: {
      fiscalCalendarId: source.actualsCutoffPeriod.fiscalCalendarId,
      periodNumber: source.actualsCutoffPeriod.periodNumber + advanceCutoff,
    },
  });

  if (!nextCutoff) {
    throw new BadRequestError('Cannot advance rolling forecast: No subsequent fiscal period found.');
  }

  // Advance horizon start and end
  const nextStart = await db.fiscalPeriod.findFirst({
    where: {
      fiscalCalendarId: source.actualsCutoffPeriod.fiscalCalendarId,
      periodNumber: (source.forecastHorizonStart?.periodNumber ?? 1) + advanceCutoff,
    },
  });

  const nextEnd = await db.fiscalPeriod.findFirst({
    where: {
      fiscalCalendarId: source.actualsCutoffPeriod.fiscalCalendarId,
      periodNumber: (source.forecastHorizonEnd?.periodNumber ?? 12) + (input.extendHorizonByPeriods ?? advanceCutoff),
    },
  }) ?? source.forecastHorizonEnd;

  // Create rolling forecast version with incremented version number
  const rolling = await createForecastVersion(orgId, userId, {
    name: input.name,
    code: input.code,
    description: input.description ?? `Rolling forecast advanced from ${source.versionCode}`,
    forecastType: 'ROLLING_FORECAST',
    planningCycleId: source.planningCycleId,
    basePlanVersionId: source.basePlanVersionId ?? source.id,
    sourceForecastVersionId: source.id,
    actualsCutoffPeriodId: nextCutoff.id,
    forecastHorizonStartId: nextStart?.id ?? nextCutoff.id,
    forecastHorizonEndId: nextEnd?.id ?? nextCutoff.id,
    forecastMethod: (source.forecastMethod as any) ?? 'ACTUALS_PLUS_REMAINING_PLAN',
    scenarioType: 'BASE_CASE',
  });

  await db.planVersion.update({
    where: { id: rolling.id },
    data: { versionNumber: source.versionNumber + 1 },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'ROLLING_FORECAST_CREATED',
    entityType: 'PlanVersion',
    entityId: rolling.id,
    metadata: {
      sourceVersionId: source.id,
      newCutoff: nextCutoff.periodName,
      advancedBy: advanceCutoff,
    },
  });

  return rolling;
}

/**
 * 7. Governance Transitions: Submit, Approve, Reject, Publish, Lock, Supersede
 */
export async function submitForecastForReview(orgId: string, userId: string, forecastId: string, notes?: string) {
  const f = await db.planVersion.findFirst({ where: { id: forecastId, organizationId: orgId } });
  if (!f) throw new NotFoundError('Forecast not found.');
  if (['LOCKED', 'PUBLISHED', 'ARCHIVED'].includes(f.status)) throw new BadRequestError(`Cannot submit forecast in '${f.status}' status.`);

  const updated = await db.planVersion.update({
    where: { id: f.id },
    data: { status: 'IN_REVIEW', submittedDate: new Date(), updatedById: userId },
  });

  await logGovernanceAction(orgId, userId, f.id, 'SUBMIT_FOR_REVIEW', f.status, 'IN_REVIEW', notes);
  return updated;
}

export async function approveForecast(orgId: string, userId: string, forecastId: string, notes?: string) {
  const f = await db.planVersion.findFirst({ where: { id: forecastId, organizationId: orgId } });
  if (!f) throw new NotFoundError('Forecast not found.');
  if (f.status === 'LOCKED') throw new BadRequestError('Cannot approve locked forecast.');

  const updated = await db.planVersion.update({
    where: { id: f.id },
    data: { status: 'APPROVED', approvedDate: new Date(), approvedById: userId, updatedById: userId },
  });

  await logGovernanceAction(orgId, userId, f.id, 'APPROVE', f.status, 'APPROVED', notes);
  return updated;
}

export async function rejectForecast(orgId: string, userId: string, forecastId: string, reason: string) {
  const f = await db.planVersion.findFirst({ where: { id: forecastId, organizationId: orgId } });
  if (!f) throw new NotFoundError('Forecast not found.');
  if (f.status === 'LOCKED') throw new BadRequestError('Cannot reject locked forecast.');

  const updated = await db.planVersion.update({
    where: { id: f.id },
    data: { status: 'REJECTED', rejectionReason: reason, updatedById: userId },
  });

  await logGovernanceAction(orgId, userId, f.id, 'REJECT', f.status, 'REJECTED', reason);
  return updated;
}

export async function publishForecast(orgId: string, userId: string, forecastId: string, notes?: string) {
  const f = await db.planVersion.findFirst({ where: { id: forecastId, organizationId: orgId } });
  if (!f) throw new NotFoundError('Forecast not found.');
  if (f.status !== 'APPROVED') throw new BadRequestError('Forecast must be approved before publishing.');

  const updated = await db.planVersion.update({
    where: { id: f.id },
    data: { status: 'PUBLISHED', isPublished: true, publishedDate: new Date(), publishedById: userId, updatedById: userId },
  });

  await logGovernanceAction(orgId, userId, f.id, 'PUBLISH', f.status, 'PUBLISHED', notes);
  return updated;
}

export async function lockForecast(orgId: string, userId: string, forecastId: string, notes?: string) {
  const f = await db.planVersion.findFirst({ where: { id: forecastId, organizationId: orgId } });
  if (!f) throw new NotFoundError('Forecast not found.');

  const updated = await db.planVersion.update({
    where: { id: f.id },
    data: { status: 'LOCKED', isLocked: true, lockedDate: new Date(), lockedById: userId, updatedById: userId },
  });

  await logGovernanceAction(orgId, userId, f.id, 'LOCK', f.status, 'LOCKED', notes);
  return updated;
}

export async function supersedeForecast(orgId: string, userId: string, forecastId: string, newForecastId: string) {
  const f = await db.planVersion.findFirst({ where: { id: forecastId, organizationId: orgId } });
  if (!f) throw new NotFoundError('Forecast not found.');

  const updated = await db.planVersion.update({
    where: { id: f.id },
    data: { status: 'SUPERSEDED', supersededDate: new Date(), updatedById: userId },
  });

  await logGovernanceAction(orgId, userId, f.id, 'SUPERSEDE', f.status, 'SUPERSEDED', `Superseded by ${newForecastId}`);
  return updated;
}

async function logGovernanceAction(
  orgId: string,
  userId: string,
  versionId: string,
  action: string,
  fromStatus: string,
  toStatus: string,
  notes?: string
) {
  await db.forecastGovernanceLog.create({
    data: {
      organizationId: orgId,
      planVersionId: versionId,
      performedById: userId,
      action,
      fromStatus,
      toStatus,
      notes: notes ?? null,
    },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: `FORECAST_${action}`,
    entityType: 'PlanVersion',
    entityId: versionId,
    metadata: { fromStatus, toStatus, notes },
  });
}

/**
 * 8. List & Get Forecast Versions
 */
export async function getForecastVersions(
  orgId: string,
  filters?: { planningCycleId?: string; forecastType?: string; status?: string; isPublished?: boolean }
) {
  return await db.planVersion.findMany({
    where: {
      organizationId: orgId,
      versionType: 'FORECAST',
      planningCycleId: filters?.planningCycleId,
      forecastType: filters?.forecastType,
      status: filters?.status,
      isPublished: filters?.isPublished,
    },
    include: {
      planningCycle: true,
      actualsCutoffPeriod: true,
      forecastHorizonStart: true,
      forecastHorizonEnd: true,
      owner: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getForecastById(orgId: string, forecastId: string) {
  const forecast = await db.planVersion.findFirst({
    where: { id: forecastId, organizationId: orgId, versionType: 'FORECAST' },
    include: {
      planningCycle: true,
      actualsCutoffPeriod: true,
      forecastHorizonStart: true,
      forecastHorizonEnd: true,
      basePlanVersion: true,
      sourceForecastVersion: true,
      derivedVersions: true,
      forecastPeriodSources: { include: { fiscalPeriod: true }, orderBy: { periodNumber: 'asc' } },
      governanceLogs: { include: { performedByUser: { select: { id: true, name: true } } }, orderBy: { performedAt: 'desc' } },
    },
  });

  if (!forecast) throw new NotFoundError(`Forecast version '${forecastId}' not found.`);
  return forecast;
}
