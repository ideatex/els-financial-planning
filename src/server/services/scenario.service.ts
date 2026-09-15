/**
 * Scenario Domain Service
 * Phase 6: What-If Scenarios, Driver Deltas, Multi-Scenario Comparison,
 * and isolated scenario calculation.
 */

import { db } from '@/lib/db';
import { recordAuditLog } from '@/lib/audit';
import { FinancialDecimal } from '@/financial-engine/domain/decimal';
import { calculateForecast, getForecastSummary, ForecastSummaryResult } from './forecast.service';
import { NotFoundError, BadRequestError, ConflictError } from '@/core/errors/AppError';
import { classifyFavorability, Favorability } from './variance.service';

export interface CreateScenarioInput {
  baseForecastVersionId: string;
  name: string;
  code: string;
  description?: string;
  scenarioType: 'BASE_CASE' | 'BEST_CASE' | 'WORST_CASE' | 'DOWNSIDE_CASE' | 'UPSIDE_CASE' | 'CUSTOM';
  deltas?: Array<{
    targetCategory?: string;
    targetCode: string;
    targetName?: string;
    deltaType: 'PERCENTAGE' | 'ABSOLUTE' | 'REPLACEMENT';
    deltaValue: number;
    rationale?: string;
    affectedPeriods?: string;
    affectedPlantId?: string;
    affectedProductId?: string;
  }>;
}

export interface WhatIfDeltaInput {
  targetCategory?: string;
  targetCode: string; // "SALES_VOLUME", "SELLING_PRICE", "RAW_MATERIAL_COST", "LABOR_RATE", "MONTHLY_OPEX", "SCRAP_PERCENTAGE", "OVERHEAD_RATE", "PRODUCTION_VOLUME"
  targetName?: string;
  deltaType: 'PERCENTAGE' | 'ABSOLUTE' | 'REPLACEMENT';
  deltaValue: number;
  rationale?: string;
  affectedPeriods?: string; // JSON array of periodIds or "ALL_FUTURE"
  affectedPlantId?: string;
  affectedProductId?: string;
}

export interface ScenarioComparisonMetric {
  metricKey: string;
  metricLabel: string;
  baseValue: number;
  scenarioValue: number;
  absoluteVariance: number;
  percentVariance: number;
  favorability: Favorability;
}

export interface ScenarioComparisonItem {
  scenarioId: string;
  scenarioCode: string;
  scenarioName: string;
  scenarioType: string;
  status: string;
  deltas: Array<{
    targetCode: string;
    targetName: string;
    deltaType: string;
    deltaValue: number;
    baselineValue: number;
    proposedValue: number;
  }>;
  metrics: Record<string, ScenarioComparisonMetric>;
  totals: {
    revenue: number;
    cogs: number;
    grossProfit: number;
    grossMarginPercent: number;
    opex: number;
    operatingProfit: number;
    operatingMarginPercent: number;
  };
  periods: Array<{
    periodId: string;
    periodNumber: number;
    periodName: string;
    revenue: number;
    cogs: number;
    grossProfit: number;
    opex: number;
    operatingProfit: number;
  }>;
}

export interface ScenarioComparisonResult {
  baseForecast: {
    id: string;
    code: string;
    name: string;
    status: string;
    totals: {
      revenue: number;
      cogs: number;
      grossProfit: number;
      grossMarginPercent: number;
      opex: number;
      operatingProfit: number;
      operatingMarginPercent: number;
    };
    periods: Array<{
      periodId: string;
      periodNumber: number;
      periodName: string;
      revenue: number;
      cogs: number;
      grossProfit: number;
      opex: number;
      operatingProfit: number;
    }>;
  };
  scenarios: ScenarioComparisonItem[];
}

/**
 * Standard Driver target metadata map
 */
const DRIVER_METADATA: Record<string, { name: string; category: string; driverType: string; inputCode: string; nature: 'FAVORABLE_HIGH' | 'FAVORABLE_LOW' }> = {
  SALES_VOLUME: {
    name: 'Sales Volume (Demand)',
    category: 'PLAN_INPUT',
    driverType: 'QUANTITY',
    inputCode: 'DEMAND_VOLUME',
    nature: 'FAVORABLE_HIGH',
  },
  SELLING_PRICE: {
    name: 'Selling Price per Unit',
    category: 'PLAN_INPUT',
    driverType: 'RATE',
    inputCode: 'SELLING_PRICE',
    nature: 'FAVORABLE_HIGH',
  },
  RAW_MATERIAL_COST: {
    name: 'Raw Material Unit Cost',
    category: 'PLAN_INPUT',
    driverType: 'RATE',
    inputCode: 'RAW_MATERIAL_PRICE',
    nature: 'FAVORABLE_LOW',
  },
  LABOR_RATE: {
    name: 'Standard Labor Rate',
    category: 'PLAN_INPUT',
    driverType: 'RATE',
    inputCode: 'LABOR_HOURLY_RATE',
    nature: 'FAVORABLE_LOW',
  },
  MONTHLY_OPEX: {
    name: 'Monthly Operating Expense',
    category: 'PLAN_INPUT',
    driverType: 'AMOUNT',
    inputCode: 'MONTHLY_OPEX',
    nature: 'FAVORABLE_LOW',
  },
  SCRAP_PERCENTAGE: {
    name: 'Scrap / Loss Percentage',
    category: 'PLAN_INPUT',
    driverType: 'PERCENTAGE',
    inputCode: 'SCRAP_PERCENTAGE',
    nature: 'FAVORABLE_LOW',
  },
  OVERHEAD_RATE: {
    name: 'Overhead Cost Rate',
    category: 'PLAN_INPUT',
    driverType: 'RATE',
    inputCode: 'OVERHEAD_COST',
    nature: 'FAVORABLE_LOW',
  },
  PRODUCTION_VOLUME: {
    name: 'Production Volume Target',
    category: 'PLAN_INPUT',
    driverType: 'QUANTITY',
    inputCode: 'PRODUCTION_TARGET',
    nature: 'FAVORABLE_HIGH',
  },
};

/**
 * 1. Create a What-If Scenario Version
 */
export async function createScenarioVersion(
  orgId: string,
  userId: string,
  input: CreateScenarioInput
) {
  // 1. Verify Base Forecast
  const baseForecast = await db.planVersion.findFirst({
    where: { id: input.baseForecastVersionId, organizationId: orgId },
    include: {
      planningCycle: true,
      forecastPeriodSources: { orderBy: { periodNumber: 'asc' } },
    },
  });
  if (!baseForecast) {
    throw new NotFoundError(`Base forecast version '${input.baseForecastVersionId}' not found.`);
  }

  // 2. Check Code Uniqueness
  const existing = await db.planVersion.findFirst({
    where: { organizationId: orgId, versionCode: input.code },
  });
  if (existing) {
    throw new ConflictError(`A version with code '${input.code}' already exists.`);
  }

  // 3. Create PlanVersion as Scenario
  const scenario = await db.planVersion.create({
    data: {
      organizationId: orgId,
      planningCycleId: baseForecast.planningCycleId,
      versionCode: input.code,
      versionName: input.name,
      description: input.description ?? `What-if scenario derived from ${baseForecast.versionCode}`,
      versionType: 'FORECAST',
      forecastType: 'SCENARIO_FORECAST',
      scenarioType: input.scenarioType,
      sourceForecastVersionId: baseForecast.id,
      basePlanVersionId: baseForecast.basePlanVersionId ?? baseForecast.id,
      actualsCutoffPeriodId: baseForecast.actualsCutoffPeriodId,
      forecastHorizonStartId: baseForecast.forecastHorizonStartId,
      forecastHorizonEndId: baseForecast.forecastHorizonEndId,
      forecastMethod: baseForecast.forecastMethod,
      versionNumber: (baseForecast.versionNumber ?? 1) + 1,
      isBaseline: false, // Scenarios are never baselines
      isPublished: false,
      isLocked: false,
      status: 'DRAFT',
      createdById: userId,
      updatedById: userId,
    },
  });

  // 4. Copy Period Sources from Base Forecast
  for (const ps of baseForecast.forecastPeriodSources) {
    await db.forecastPeriodSource.create({
      data: {
        organizationId: orgId,
        planVersionId: scenario.id,
        fiscalPeriodId: ps.fiscalPeriodId,
        periodNumber: ps.periodNumber,
        sourceType: ps.sourceType,
        actualsAvailable: ps.actualsAvailable,
        forecastAvailable: false, // Needs recalculation
        actualRevenue: ps.actualRevenue,
        actualCogs: ps.actualCogs,
        actualOpex: ps.actualOpex,
        actualNetProfit: ps.actualNetProfit,
        forecastRevenue: null,
        forecastCogs: null,
        forecastOpex: null,
        forecastNetProfit: null,
      },
    });
  }

  // 5. Copy Base Plan Inputs to Scenario Version
  const baseInputs = await db.planInput.findMany({
    where: { organizationId: orgId, planVersionId: baseForecast.id },
  });

  for (const bi of baseInputs) {
    await db.planInput.create({
      data: {
        organizationId: orgId,
        planningCycleId: scenario.planningCycleId,
        planVersionId: scenario.id,
        fiscalPeriodId: bi.fiscalPeriodId,
        plantId: bi.plantId,
        productId: bi.productId,
        materialId: bi.materialId,
        inputCategory: bi.inputCategory,
        inputCode: bi.inputCode,
        inputValue: bi.inputValue,
        unitOfMeasure: bi.unitOfMeasure,
        currency: bi.currency,
        sourceType: 'SCENARIO_BASELINE',
        sourceReference: `BaseForecast:${baseForecast.id}`,
        createdById: userId,
      },
    });
  }

  // 6. Apply initial deltas if provided
  if (input.deltas && input.deltas.length > 0) {
    for (const delta of input.deltas) {
      await applyWhatIfDelta(orgId, userId, scenario.id, delta);
    }
  }

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'CREATE_SCENARIO_VERSION',
    entityType: 'PlanVersion',
    entityId: scenario.id,
    metadata: {
      baseForecastVersionId: baseForecast.id,
      scenarioType: input.scenarioType,
      code: input.code,
    },
  });

  return scenario;
}

/**
 * 2. Apply or Update a What-If Delta
 */
export async function applyWhatIfDelta(
  orgId: string,
  userId: string,
  scenarioVersionId: string,
  input: WhatIfDeltaInput
) {
  const scenario = await db.planVersion.findFirst({
    where: { id: scenarioVersionId, organizationId: orgId },
    include: {
      actualsCutoffPeriod: true,
      forecastPeriodSources: { orderBy: { periodNumber: 'asc' } },
    },
  });

  if (!scenario) throw new NotFoundError('Scenario version not found.');
  if (scenario.isLocked) throw new BadRequestError('Cannot modify what-if deltas on a locked scenario.');
  if (scenario.isBaseline) throw new BadRequestError('Cannot apply what-if deltas directly to a baseline forecast.');

  const meta = DRIVER_METADATA[input.targetCode] ?? {
    name: input.targetName ?? input.targetCode,
    category: input.targetCategory ?? 'PLAN_INPUT',
    driverType: 'RATE',
    inputCode: input.targetCode,
    nature: 'FAVORABLE_HIGH',
  };

  // Find baseline inputs for this code in the scenario
  const matchingInputs = await db.planInput.findMany({
    where: {
      organizationId: orgId,
      planVersionId: scenario.id,
      OR: [{ inputCode: meta.inputCode }, { inputCode: input.targetCode }],
    },
  });

  // Determine baseline value from existing inputs, or default fallback
  let baselineValue = 0;
  if (matchingInputs.length > 0) {
    const sum = matchingInputs.reduce((acc, curr) => acc + curr.inputValue, 0);
    baselineValue = sum / matchingInputs.length;
  } else {
    // If none found in scenario, look at base forecast
    if (scenario.sourceForecastVersionId) {
      const parentInputs = await db.planInput.findMany({
        where: {
          organizationId: orgId,
          planVersionId: scenario.sourceForecastVersionId,
          OR: [{ inputCode: meta.inputCode }, { inputCode: input.targetCode }],
        },
      });
      if (parentInputs.length > 0) {
        const sum = parentInputs.reduce((acc, curr) => acc + curr.inputValue, 0);
        baselineValue = sum / parentInputs.length;
      }
    }
  }

  // Calculate proposed value
  let proposedValue = baselineValue;
  if (input.deltaType === 'PERCENTAGE') {
    const pctFactor = FinancialDecimal.from(1).plus(FinancialDecimal.from(input.deltaValue).dividedBy(100));
    proposedValue = FinancialDecimal.from(baselineValue).times(pctFactor).toNumber();
  } else if (input.deltaType === 'ABSOLUTE') {
    proposedValue = FinancialDecimal.from(baselineValue).plus(input.deltaValue).toNumber();
  } else if (input.deltaType === 'REPLACEMENT') {
    proposedValue = input.deltaValue;
  }

  // Upsert WhatIfScenarioDelta record
  const existingDelta = await db.whatIfScenarioDelta.findFirst({
    where: {
      organizationId: orgId,
      planVersionId: scenario.id,
      targetCode: input.targetCode,
    },
  });

  let deltaRecord;
  if (existingDelta) {
    deltaRecord = await db.whatIfScenarioDelta.update({
      where: { id: existingDelta.id },
      data: {
        targetName: input.targetName ?? meta.name,
        targetCategory: input.targetCategory ?? meta.category,
        driverType: meta.driverType,
        deltaType: input.deltaType,
        deltaValue: input.deltaValue,
        baselineValue,
        proposedValue,
        affectedPeriods: input.affectedPeriods ?? 'ALL_FUTURE',
        affectedPlantId: input.affectedPlantId ?? null,
        affectedProductId: input.affectedProductId ?? null,
        rationale: input.rationale ?? null,
        appliedById: userId,
      },
    });
  } else {
    deltaRecord = await db.whatIfScenarioDelta.create({
      data: {
        organizationId: orgId,
        planVersionId: scenario.id,
        targetCategory: input.targetCategory ?? meta.category,
        targetCode: input.targetCode,
        targetName: input.targetName ?? meta.name,
        driverType: meta.driverType,
        deltaType: input.deltaType,
        deltaValue: input.deltaValue,
        baselineValue,
        proposedValue,
        affectedPeriods: input.affectedPeriods ?? 'ALL_FUTURE',
        affectedPlantId: input.affectedPlantId ?? null,
        affectedProductId: input.affectedProductId ?? null,
        rationale: input.rationale ?? null,
        appliedById: userId,
      },
    });
  }

  // Materialize updated PlanInput for future forecast periods
  const cutoffNumber = scenario.actualsCutoffPeriod?.periodNumber ?? 0;
  const futurePeriods = scenario.forecastPeriodSources.filter((ps) => ps.periodNumber > cutoffNumber);

  for (const fp of futurePeriods) {
    // If affectedPeriods is specific array and does not include fp.fiscalPeriodId, skip
    if (input.affectedPeriods && input.affectedPeriods !== 'ALL_FUTURE') {
      try {
        const periodIds: string[] = JSON.parse(input.affectedPeriods);
        if (!periodIds.includes(fp.fiscalPeriodId)) continue;
      } catch {
        // if not valid JSON, treat as ALL_FUTURE
      }
    }

    // Update existing matching plan inputs for this period, or create if not present
    const existingInputs = await db.planInput.findMany({
      where: {
        organizationId: orgId,
        planVersionId: scenario.id,
        fiscalPeriodId: fp.fiscalPeriodId,
        OR: [{ inputCode: meta.inputCode }, { inputCode: input.targetCode }],
      },
    });

    if (existingInputs.length > 0) {
      for (const ei of existingInputs) {
        let periodProposed = proposedValue;
        if (input.deltaType === 'PERCENTAGE') {
          const factor = FinancialDecimal.from(1).plus(FinancialDecimal.from(input.deltaValue).dividedBy(100));
          periodProposed = FinancialDecimal.from(ei.inputValue).times(factor).toNumber();
        }
        await db.planInput.update({
          where: { id: ei.id },
          data: {
            inputValue: periodProposed,
            sourceType: 'SCENARIO_DELTA',
            sourceReference: `Delta:${deltaRecord.id}`,
            updatedById: userId,
          },
        });
      }
    } else {
      await db.planInput.create({
        data: {
          organizationId: orgId,
          planningCycleId: scenario.planningCycleId,
          planVersionId: scenario.id,
          fiscalPeriodId: fp.fiscalPeriodId,
          plantId: input.affectedPlantId ?? null,
          productId: input.affectedProductId ?? null,
          inputCategory: meta.category,
          inputCode: meta.inputCode,
          inputValue: proposedValue,
          unitOfMeasure: meta.driverType === 'RATE' ? 'INR' : 'UNITS',
          currency: 'INR',
          sourceType: 'SCENARIO_DELTA',
          sourceReference: `Delta:${deltaRecord.id}`,
          createdById: userId,
        },
      });
    }
  }

  // Mark scenario status as DRAFT since inputs changed
  await db.planVersion.update({
    where: { id: scenario.id },
    data: { status: 'DRAFT', updatedById: userId },
  });

  return deltaRecord;
}

/**
 * 3. Get all What-If Deltas for a Scenario
 */
export async function getScenarioDeltas(orgId: string, scenarioVersionId: string) {
  const scenario = await db.planVersion.findFirst({
    where: { id: scenarioVersionId, organizationId: orgId },
  });
  if (!scenario) throw new NotFoundError('Scenario version not found.');

  return await db.whatIfScenarioDelta.findMany({
    where: { organizationId: orgId, planVersionId: scenarioVersionId },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * 4. Remove a What-If Delta
 */
export async function removeScenarioDelta(orgId: string, userId: string, scenarioVersionId: string, deltaId: string) {
  const delta = await db.whatIfScenarioDelta.findFirst({
    where: { id: deltaId, planVersionId: scenarioVersionId, organizationId: orgId },
  });
  if (!delta) throw new NotFoundError('Delta not found.');

  await db.whatIfScenarioDelta.delete({ where: { id: delta.id } });

  // Revert inputs matching this delta back to base forecast
  const scenario = await db.planVersion.findFirst({
    where: { id: scenarioVersionId, organizationId: orgId },
  });

  if (scenario?.sourceForecastVersionId) {
    const meta = DRIVER_METADATA[delta.targetCode] ?? { inputCode: delta.targetCode };
    const parentInputs = await db.planInput.findMany({
      where: {
        organizationId: orgId,
        planVersionId: scenario.sourceForecastVersionId,
        OR: [{ inputCode: meta.inputCode }, { inputCode: delta.targetCode }],
      },
    });

    for (const pi of parentInputs) {
      const scenarioInputs = await db.planInput.findMany({
        where: {
          organizationId: orgId,
          planVersionId: scenario.id,
          fiscalPeriodId: pi.fiscalPeriodId,
          inputCode: pi.inputCode,
        },
      });
      for (const si of scenarioInputs) {
        await db.planInput.update({
          where: { id: si.id },
          data: {
            inputValue: pi.inputValue,
            sourceType: 'SCENARIO_BASELINE',
            sourceReference: `RevertBase:${scenario.sourceForecastVersionId}`,
            updatedById: userId,
          },
        });
      }
    }
  }

  return { success: true };
}

/**
 * 5. Calculate Scenario
 */
export async function calculateScenario(
  orgId: string,
  userId: string,
  scenarioVersionId: string,
  params?: { plantId?: string; productId?: string }
): Promise<ForecastSummaryResult> {
  return await calculateForecast(orgId, userId, scenarioVersionId, params);
}

/**
 * 6. Compare Scenarios against Base Forecast
 */
export async function compareScenarios(
  orgId: string,
  baseForecastVersionId: string,
  scenarioVersionIds: string[]
): Promise<ScenarioComparisonResult> {
  // 1. Get Base Forecast Summary
  const baseSummary = await getForecastSummary(orgId, baseForecastVersionId);
  const baseForecast = await db.planVersion.findFirst({
    where: { id: baseForecastVersionId, organizationId: orgId },
  });
  if (!baseForecast) throw new NotFoundError('Base forecast not found.');

  const scenariosResult: ScenarioComparisonItem[] = [];

  // 2. Compute metrics and variances for each Scenario
  for (const scenarioId of scenarioVersionIds) {
    const scSummary = await getForecastSummary(orgId, scenarioId);
    const scVersion = await db.planVersion.findFirst({
      where: { id: scenarioId, organizationId: orgId },
    });
    if (!scVersion) continue;

    const deltas = await db.whatIfScenarioDelta.findMany({
      where: { organizationId: orgId, planVersionId: scenarioId },
    });

    // Calculate Metric Variances
    const buildMetric = (
      metricKey: string,
      label: string,
      baseVal: number,
      scVal: number,
      category: 'REVENUE' | 'PRODUCTION' | 'MATERIAL' | 'LABOR' | 'OVERHEAD' | 'COGS' | 'GROSS_PROFIT' | 'OPEX' | 'OPERATING_PROFIT'
    ): ScenarioComparisonMetric => {
      const absVar = FinancialDecimal.from(scVal).minus(baseVal).toNumber();
      const pctVar = baseVal !== 0
        ? FinancialDecimal.from(absVar).dividedBy(Math.abs(baseVal)).times(100).toNumber()
        : 0;
      const favorability = classifyFavorability(category, baseVal, scVal);

      return {
        metricKey,
        metricLabel: label,
        baseValue: baseVal,
        scenarioValue: scVal,
        absoluteVariance: absVar,
        percentVariance: pctVar,
        favorability,
      };
    };

    const metrics: Record<string, ScenarioComparisonMetric> = {
      revenue: buildMetric('revenue', 'Revenue', baseSummary.totals.revenue, scSummary.totals.revenue, 'REVENUE'),
      cogs: buildMetric('cogs', 'Cost of Goods Sold (COGS)', baseSummary.totals.cogs, scSummary.totals.cogs, 'COGS'),
      grossProfit: buildMetric('grossProfit', 'Gross Profit', baseSummary.totals.grossProfit, scSummary.totals.grossProfit, 'GROSS_PROFIT'),
      grossMarginPercent: buildMetric('grossMarginPercent', 'Gross Margin %', baseSummary.totals.grossMarginPercent, scSummary.totals.grossMarginPercent, 'GROSS_PROFIT'),
      opex: buildMetric('opex', 'Operating Expenses (Opex)', baseSummary.totals.opex, scSummary.totals.opex, 'OPEX'),
      operatingProfit: buildMetric('operatingProfit', 'Operating Profit (EBIT)', baseSummary.totals.operatingProfit, scSummary.totals.operatingProfit, 'OPERATING_PROFIT'),
      operatingMarginPercent: buildMetric('operatingMarginPercent', 'Operating Margin %', baseSummary.totals.operatingMarginPercent, scSummary.totals.operatingMarginPercent, 'OPERATING_PROFIT'),
    };

    scenariosResult.push({
      scenarioId: scVersion.id,
      scenarioCode: scVersion.versionCode,
      scenarioName: scVersion.versionName,
      scenarioType: scVersion.scenarioType ?? 'CUSTOM',
      status: scVersion.status,
      deltas: deltas.map((d) => ({
        targetCode: d.targetCode,
        targetName: d.targetName,
        deltaType: d.deltaType,
        deltaValue: d.deltaValue,
        baselineValue: d.baselineValue,
        proposedValue: d.proposedValue,
      })),
      metrics,
      totals: {
        revenue: scSummary.totals.revenue,
        cogs: scSummary.totals.cogs,
        grossProfit: scSummary.totals.grossProfit,
        grossMarginPercent: scSummary.totals.grossMarginPercent,
        opex: scSummary.totals.opex,
        operatingProfit: scSummary.totals.operatingProfit,
        operatingMarginPercent: scSummary.totals.operatingMarginPercent,
      },
      periods: scSummary.periods.map((p) => ({
        periodId: p.periodId,
        periodNumber: p.periodNumber,
        periodName: p.periodName,
        revenue: p.revenue,
        cogs: p.cogs,
        grossProfit: p.grossProfit,
        opex: p.opex,
        operatingProfit: p.operatingProfit,
      })),
    });
  }

  return {
    baseForecast: {
      id: baseForecast.id,
      code: baseForecast.versionCode,
      name: baseForecast.versionName,
      status: baseForecast.status,
      totals: {
        revenue: baseSummary.totals.revenue,
        cogs: baseSummary.totals.cogs,
        grossProfit: baseSummary.totals.grossProfit,
        grossMarginPercent: baseSummary.totals.grossMarginPercent,
        opex: baseSummary.totals.opex,
        operatingProfit: baseSummary.totals.operatingProfit,
        operatingMarginPercent: baseSummary.totals.operatingMarginPercent,
      },
      periods: baseSummary.periods.map((p) => ({
        periodId: p.periodId,
        periodNumber: p.periodNumber,
        periodName: p.periodName,
        revenue: p.revenue,
        cogs: p.cogs,
        grossProfit: p.grossProfit,
        opex: p.opex,
        operatingProfit: p.operatingProfit,
      })),
    },
    scenarios: scenariosResult,
  };
}
