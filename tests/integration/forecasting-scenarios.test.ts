import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '@/lib/db';
import { registerUser } from '@/server/services/auth.service';
import { createPlant } from '@/server/services/plant.service';
import { createProduct } from '@/server/services/product.service';
import { createMaterial } from '@/server/services/material.service';
import { createBomHeader, getBomById, addBomLine } from '@/server/services/bom.service';
import { createRoutingHeader, getRoutingById, addRoutingOperation } from '@/server/services/routing.service';
import { createAccount } from '@/server/services/coa.service';
import { createFiscalCalendar } from '@/server/services/calendar.service';
import { createPlanningCycle } from '@/server/services/planning-cycle.service';
import { createPlanVersion } from '@/server/services/plan-version.service';
import { upsertPlanInput } from '@/server/services/plan-input.service';
import { executeCalculation } from '@/server/services/calculation.service';
import {
  createForecastVersion,
  calculateForecast,
  getForecastSummary,
  createRollingForecast,
  submitForecastForReview,
  approveForecast,
  publishForecast,
  lockForecast,
  getForecastById,
} from '@/server/services/forecast.service';
import {
  createScenarioVersion,
  applyWhatIfDelta,
  getScenarioDeltas,
  calculateScenario,
  compareScenarios,
} from '@/server/services/scenario.service';

describe('Phase 6 Forecasting, Rolling Horizons & What-If Scenarios Integration', { timeout: 60000 }, () => {
  let orgId: string;
  let plannerUserId: string;
  let reviewerUserId: string;

  let otherOrgId: string;
  let otherUserId: string;

  let plantId: string;
  let productId: string;
  let materialId: string;
  let cycleId: string;
  let basePlanVersionId: string;
  let fiscalPeriods: Array<{ id: string; periodNumber: number; periodName: string }> = [];

  let baseForecastId: string;
  let rollingForecastId: string;
  let bestCaseScenarioId: string;
  let worstCaseScenarioId: string;

  beforeAll(async () => {
    // 1. Setup primary organization with planner & reviewer
    const plannerEmail = `fcst-planner-${Date.now()}@test.com`;
    const regPlanner = await registerUser({
      email: plannerEmail,
      password: 'Password123!',
      name: 'FP&A Lead Forecaster',
      organizationName: `Aero Precision Components ${Date.now()}`,
    });
    orgId = regPlanner.organization.id;
    plannerUserId = regPlanner.user.id;

    await db.membership.update({
      where: { userId_organizationId: { userId: plannerUserId, organizationId: orgId } },
      data: { role: 'PLANNER' },
    });

    const reviewerUser = await db.user.create({
      data: {
        email: `fcst-reviewer-${Date.now()}@test.com`,
        passwordHash: 'hashed_pw',
        name: 'VP Finance Controller',
      },
    });
    reviewerUserId = reviewerUser.id;
    await db.membership.create({
      data: {
        userId: reviewerUserId,
        organizationId: orgId,
        role: 'REVIEWER',
      },
    });

    // 2. Setup separate organization for multi-tenant isolation
    const regOther = await registerUser({
      email: `fcst-other-${Date.now()}@test.com`,
      password: 'Password123!',
      name: 'External Tenant Forecaster',
      organizationName: `Rival Aerospace Corp ${Date.now()}`,
    });
    otherOrgId = regOther.organization.id;
    otherUserId = regOther.user.id;

    // 3. Master Data: Plant, Product, Material
    const plant = await createPlant(orgId, plannerUserId, {
      code: 'PLANT-BLR',
      name: 'Bengaluru Facility',
      country: 'IN',
      timeZone: 'Asia/Kolkata',
      baseCurrency: 'INR',
      isActive: true,
    });
    plantId = plant.id;

    const product = await createProduct(orgId, plannerUserId, {
      code: 'SKU-VALVE-500',
      name: 'Precision Hydraulic Valve',
      category: 'HYDRAULICS',
      productType: 'FINISHED_GOOD',
      unitOfMeasure: 'EA',
      standardPriceCents: 50000, // ₹500.00
      currency: 'INR',
      defaultPlantId: plantId,
      isActive: true,
    });
    productId = product.id;

    const material = await createMaterial(orgId, plannerUserId, {
      code: 'RAW-ALLOY-01',
      name: 'Specialty Titanium Alloy',
      category: 'METALS',
      unitOfMeasure: 'KG',
      defaultCostCents: 9000, // ₹90.00 / KG
      currency: 'INR',
      isActive: true,
      leadTimeDays: 5,
    });
    materialId = material.id;

    // COA Accounts
    await createAccount(orgId, plannerUserId, {
      code: '4010',
      name: 'Product Sales Revenue',
      accountType: 'REVENUE',
      normalBalance: 'CREDIT',
      currency: 'INR',
      isActive: true,
    });
    await createAccount(orgId, plannerUserId, {
      code: '5010',
      name: 'Direct Materials COGS',
      accountType: 'COGS',
      normalBalance: 'DEBIT',
      currency: 'INR',
      isActive: true,
    });
    await createAccount(orgId, plannerUserId, {
      code: '6010',
      name: 'Operating Expense',
      accountType: 'OPERATING_EXPENSE',
      normalBalance: 'DEBIT',
      currency: 'INR',
      isActive: true,
    });

    // BOM: 2.2 KG of material per unit
    const bom = await createBomHeader(orgId, plannerUserId, {
      productId,
      name: 'Hydraulic Valve BOM',
      isActive: true,
    });
    const bomFull = await getBomById(orgId, bom.id);
    const bomVerId = bomFull.versions[0].id;
    await addBomLine(orgId, plannerUserId, bomVerId, {
      componentType: 'MATERIAL',
      materialId,
      quantityPerUnit: 2.2,
      unitOfMeasure: 'KG',
      scrapPercentage: 0,
    });
    await db.bomVersion.update({
      where: { id: bomVerId },
      data: { status: 'APPROVED' },
    });

    // Routing: 0.55 hrs / unit
    const routing = await createRoutingHeader(orgId, plannerUserId, {
      productId,
      plantId,
      name: 'Valve Precision Machining Routing',
      isActive: true,
    });
    const routingFull = await getRoutingById(orgId, routing.id);
    const routingVerId = routingFull.versions[0].id;
    await addRoutingOperation(orgId, plannerUserId, routingVerId, {
      sequence: 10,
      operationName: 'Precision CNC Machining',
      workCenter: 'CNC-01',
      laborHoursPerUnit: 0.55,
      machineHoursPerUnit: 0.25,
    });
    await db.routingVersion.update({
      where: { id: routingVerId },
      data: { status: 'APPROVED' },
    });

    // Driver: Labor Rate = 200 INR/hr
    await db.driver.create({
      data: {
        organizationId: orgId,
        driverCode: 'DRV-LABOR-RATE',
        driverName: 'Standard Labor Rate',
        driverCategory: 'LABOR',
        driverType: 'RATE',
        unitOfMeasure: 'INR/HR',
        defaultValue: 200.0,
        currency: 'INR',
        isActive: true,
      },
    });

    // Fiscal Calendar with 12 periods
    const calendar = await createFiscalCalendar(orgId, plannerUserId, {
      name: 'FY2026 Monthly Calendar',
      startYear: 2026,
      fiscalYearStartMonth: 1,
      calendarType: 'MONTHLY',
    });
    fiscalPeriods = calendar.periods.map((p) => ({
      id: p.id,
      periodNumber: p.periodNumber,
      periodName: p.periodName,
    }));

    // Planning Cycle
    const cycle = await createPlanningCycle(orgId, plannerUserId, {
      name: 'FY2026 Operating Plan Cycle',
      planningType: 'ANNUAL_BUDGET',
      fiscalYear: 2026,
      startPeriodId: fiscalPeriods[0].id,
      endPeriodId: fiscalPeriods[11].id,
    });
    cycleId = cycle.id;

    // Base Plan Version
    const basePlan = await createPlanVersion(orgId, plannerUserId, cycleId, {
      versionCode: 'FY26-BUDGET',
      versionName: 'FY2026 Approved Budget Baseline',
      versionType: 'ORIGINAL_BUDGET',
      description: 'Annual budget approved baseline',
    });
    basePlanVersionId = basePlan.id;

    // Seed standard planning inputs for all 12 periods in baseline plan
    for (const p of fiscalPeriods) {
      // Demand: 1000 EA
      await upsertPlanInput(orgId, plannerUserId, {
        planningCycleId: cycleId,
        planVersionId: basePlanVersionId,
        fiscalPeriodId: p.id,
        plantId,
        productId,
        inputCategory: 'DEMAND',
        inputCode: 'DEMAND_VOLUME',
        inputValue: 1000,
        unitOfMeasure: 'EA',
      });

      // Selling Price: ₹500
      await upsertPlanInput(orgId, plannerUserId, {
        planningCycleId: cycleId,
        planVersionId: basePlanVersionId,
        fiscalPeriodId: p.id,
        plantId,
        productId,
        inputCategory: 'DEMAND',
        inputCode: 'SELLING_PRICE',
        inputValue: 500,
        unitOfMeasure: 'INR',
        currency: 'INR',
      });

      // Production target: 1100 EA
      await upsertPlanInput(orgId, plannerUserId, {
        planningCycleId: cycleId,
        planVersionId: basePlanVersionId,
        fiscalPeriodId: p.id,
        plantId,
        productId,
        inputCategory: 'PRODUCTION',
        inputCode: 'PRODUCTION_TARGET',
        inputValue: 1100,
        unitOfMeasure: 'EA',
      });

      // Raw Material Price: ₹90/KG
      await upsertPlanInput(orgId, plannerUserId, {
        planningCycleId: cycleId,
        planVersionId: basePlanVersionId,
        fiscalPeriodId: p.id,
        plantId,
        materialId,
        inputCategory: 'MATERIAL',
        inputCode: 'RAW_MATERIAL_PRICE',
        inputValue: 90,
        unitOfMeasure: 'INR/KG',
        currency: 'INR',
      });

      // Labor Wage: ₹200/HR
      await upsertPlanInput(orgId, plannerUserId, {
        planningCycleId: cycleId,
        planVersionId: basePlanVersionId,
        fiscalPeriodId: p.id,
        plantId,
        inputCategory: 'LABOR',
        inputCode: 'LABOR_HOURLY_RATE',
        inputValue: 200,
        unitOfMeasure: 'INR/HR',
        currency: 'INR',
      });

      // Overhead: ₹44,000 / month
      await upsertPlanInput(orgId, plannerUserId, {
        planningCycleId: cycleId,
        planVersionId: basePlanVersionId,
        fiscalPeriodId: p.id,
        plantId,
        inputCategory: 'OVERHEAD',
        inputCode: 'OVERHEAD_COST',
        inputValue: 44000,
        unitOfMeasure: 'INR',
        currency: 'INR',
      });

      // Opex: ₹100,000 / month
      await upsertPlanInput(orgId, plannerUserId, {
        planningCycleId: cycleId,
        planVersionId: basePlanVersionId,
        fiscalPeriodId: p.id,
        plantId,
        inputCategory: 'OPEX',
        inputCode: 'MONTHLY_OPEX',
        inputValue: 100000,
        unitOfMeasure: 'INR',
        currency: 'INR',
      });
    }

    // Run baseline calculation for P01
    await executeCalculation(orgId, plannerUserId, {
      planningCycleId: cycleId,
      planVersionId: basePlanVersionId,
      fiscalPeriodId: fiscalPeriods[0].id,
      plantId,
      productId,
    });
  });

  // ==========================================
  // Test 1: Forecast Creation & Period Classification
  // ==========================================
  it('creates forecast version with 3 months actuals cutoff and 9 months forecast horizon', async () => {
    const forecast = await createForecastVersion(orgId, plannerUserId, {
      name: 'FY2026 Q1 Actuals + 9M Forecast',
      code: 'FY26-3+9-FCST',
      description: '3M Actuals combined with 9M deterministic forecast projection',
      forecastType: 'MONTHLY_FORECAST',
      planningCycleId: cycleId,
      basePlanVersionId,
      actualsCutoffPeriodId: fiscalPeriods[2].id, // P03
      forecastHorizonStartId: fiscalPeriods[3].id, // P04
      forecastHorizonEndId: fiscalPeriods[11].id, // P12
      forecastMethod: 'ACTUALS_PLUS_REMAINING_PLAN',
    });

    baseForecastId = forecast.id;
    expect(forecast.versionCode).toBe('FY26-3+9-FCST');
    expect(forecast.forecastType).toBe('MONTHLY_FORECAST');
    expect(forecast.isBaseline).toBe(true);
    expect(forecast.status).toBe('DRAFT');

    // Verify ForecastPeriodSource records
    const periodSources = await db.forecastPeriodSource.findMany({
      where: { organizationId: orgId, planVersionId: forecast.id },
      orderBy: { periodNumber: 'asc' },
    });

    expect(periodSources).toHaveLength(12);

    // Periods 1-3 should be ACTUAL
    expect(periodSources[0].sourceType).toBe('ACTUAL');
    expect(periodSources[1].sourceType).toBe('ACTUAL');
    expect(periodSources[2].sourceType).toBe('ACTUAL');

    // Periods 4-12 should be FORECAST
    for (let i = 3; i < 12; i++) {
      expect(periodSources[i].sourceType).toBe('FORECAST');
      expect(periodSources[i].periodNumber).toBe(i + 1);
    }
  });

  // ==========================================
  // Test 2: Deterministic Multi-Period Calculation
  // ==========================================
  it('orchestrates deterministic multi-period calculation for all forecast periods', async () => {
    const summary = await calculateForecast(orgId, plannerUserId, baseForecastId, {
      plantId,
      productId,
    });

    expect(summary.forecastVersion.id).toBe(baseForecastId);
    expect(summary.forecastVersion.status).toBe('CALCULATED');
    expect(summary.periods).toHaveLength(12);

    // Verify totals
    expect(summary.totals.actualPeriodsCount).toBe(3);
    expect(summary.totals.forecastPeriodsCount).toBe(9);
    expect(summary.totals.revenue).toBeGreaterThan(0);
    expect(summary.totals.cogs).toBeGreaterThan(0);
    expect(summary.totals.grossProfit).toBeGreaterThan(0);
    expect(summary.totals.operatingProfit).toBeGreaterThan(0);
  });

  // ==========================================
  // Test 3: Rolling Forecast Generation & Advance
  // ==========================================
  it('generates a rolling forecast, advancing cutoff by 1 period and preserving immutability of parent', async () => {
    const rolling = await createRollingForecast(orgId, plannerUserId, {
      sourceForecastVersionId: baseForecastId,
      name: 'Rolling 12M Forecast - P04 Advance',
      code: 'FY26-ROLLING-P04',
      description: 'Cutoff advanced to P04',
      advanceCutoffByPeriods: 1,
      extendHorizonByPeriods: 0,
    });

    rollingForecastId = rolling.id;
    expect(rolling.versionCode).toBe('FY26-ROLLING-P04');
    expect(rolling.forecastType).toBe('ROLLING_FORECAST');
    expect(rolling.sourceForecastVersionId).toBe(baseForecastId);

    // Verify cutoff period shifted from P03 to P04
    expect(rolling.actualsCutoffPeriodId).toBe(fiscalPeriods[3].id);

    // Verify period sources of the new rolling version
    const rollingSources = await db.forecastPeriodSource.findMany({
      where: { organizationId: orgId, planVersionId: rolling.id },
      orderBy: { periodNumber: 'asc' },
    });

    // P01 through P04 should now be ACTUAL
    expect(rollingSources[0].sourceType).toBe('ACTUAL');
    expect(rollingSources[1].sourceType).toBe('ACTUAL');
    expect(rollingSources[2].sourceType).toBe('ACTUAL');
    expect(rollingSources[3].sourceType).toBe('ACTUAL'); // Newly advanced actual period!

    // P05 through P12 should be FORECAST
    expect(rollingSources[4].sourceType).toBe('FORECAST');
    expect(rollingSources[11].sourceType).toBe('FORECAST');

    // Verify parent forecast was NOT mutated
    const parentForecast = await getForecastById(orgId, baseForecastId);
    expect(parentForecast.actualsCutoffPeriodId).toBe(fiscalPeriods[2].id);
  });

  // ==========================================
  // Test 4: What-If Scenario Creation - Best Case
  // ==========================================
  it('creates Best Case scenario (+10% volume, +2% price, -3% material cost) and verifies exact Section 19 math', async () => {
    const scenario = await createScenarioVersion(orgId, plannerUserId, {
      baseForecastVersionId: baseForecastId,
      name: 'FY2026 Best Case Market Expansion',
      code: 'FY26-BEST-CASE',
      scenarioType: 'BEST_CASE',
      description: 'Positive demand surge and favorable raw material negotiation',
    });

    bestCaseScenarioId = scenario.id;
    expect(scenario.isBaseline).toBe(false);
    expect(scenario.scenarioType).toBe('BEST_CASE');

    // 1. Apply +10% Sales Volume
    const deltaVol = await applyWhatIfDelta(orgId, plannerUserId, bestCaseScenarioId, {
      targetCode: 'SALES_VOLUME',
      deltaType: 'PERCENTAGE',
      deltaValue: 10,
      rationale: '+10% volume demand surge',
    });
    expect(deltaVol.proposedValue).toBe(1100);

    // 2. Apply +2% Selling Price
    const deltaPrice = await applyWhatIfDelta(orgId, plannerUserId, bestCaseScenarioId, {
      targetCode: 'SELLING_PRICE',
      deltaType: 'PERCENTAGE',
      deltaValue: 2,
      rationale: '+2% annual price indexation',
    });
    expect(deltaPrice.proposedValue).toBe(510);

    // 3. Apply -3% Raw Material Price
    const deltaMat = await applyWhatIfDelta(orgId, plannerUserId, bestCaseScenarioId, {
      targetCode: 'RAW_MATERIAL_COST',
      deltaType: 'PERCENTAGE',
      deltaValue: -3,
      rationale: '-3% bulk raw material discount',
    });
    expect(deltaMat.proposedValue).toBe(87.3);

    // Verify deltas stored
    const allDeltas = await getScenarioDeltas(orgId, bestCaseScenarioId);
    expect(allDeltas).toHaveLength(3);

    // Calculate Scenario
    const calcSummary = await calculateScenario(orgId, plannerUserId, bestCaseScenarioId, {
      plantId,
      productId,
    });

    expect(calcSummary.forecastVersion.status).toBe('CALCULATED');
    // Future period revenue must reflect 1100 EA * ₹510 = ₹561,000
    const futurePeriod = calcSummary.periods.find((p) => p.periodNumber === 4);
    expect(futurePeriod?.revenue).toBe(561000);
  });

  // ==========================================
  // Test 5: What-If Scenario Creation - Worst Case
  // ==========================================
  it('creates Worst Case scenario (-10% volume, +5% material, +8% opex) and verifies exact Section 19 math', async () => {
    const scenario = await createScenarioVersion(orgId, plannerUserId, {
      baseForecastVersionId: baseForecastId,
      name: 'FY2026 Worst Case Market Downturn',
      code: 'FY26-WORST-CASE',
      scenarioType: 'WORST_CASE',
      description: 'Volume contraction and inflationary raw material spike',
    });

    worstCaseScenarioId = scenario.id;
    expect(scenario.isBaseline).toBe(false);
    expect(scenario.scenarioType).toBe('WORST_CASE');

    // 1. Apply -10% Sales Volume
    const deltaVol = await applyWhatIfDelta(orgId, plannerUserId, worstCaseScenarioId, {
      targetCode: 'SALES_VOLUME',
      deltaType: 'PERCENTAGE',
      deltaValue: -10,
      rationale: '-10% volume decline',
    });
    expect(deltaVol.proposedValue).toBe(900);

    // 2. Apply +5% Raw Material Price
    const deltaMat = await applyWhatIfDelta(orgId, plannerUserId, worstCaseScenarioId, {
      targetCode: 'RAW_MATERIAL_COST',
      deltaType: 'PERCENTAGE',
      deltaValue: 5,
      rationale: '+5% raw material inflation',
    });
    expect(deltaMat.proposedValue).toBe(94.5);

    // 3. Apply +8% Monthly Opex
    const deltaOpex = await applyWhatIfDelta(orgId, plannerUserId, worstCaseScenarioId, {
      targetCode: 'MONTHLY_OPEX',
      deltaType: 'PERCENTAGE',
      deltaValue: 8,
      rationale: '+8% SG&A inflation',
    });
    expect(deltaOpex.proposedValue).toBe(108000);

    // Calculate Scenario
    const calcSummary = await calculateScenario(orgId, plannerUserId, worstCaseScenarioId, {
      plantId,
      productId,
    });

    expect(calcSummary.forecastVersion.status).toBe('CALCULATED');
    // Future period revenue must reflect 900 EA * ₹500 = ₹450,000
    const futurePeriod = calcSummary.periods.find((p) => p.periodNumber === 4);
    expect(futurePeriod?.revenue).toBe(450000);
  });

  // ==========================================
  // Test 6: Zero Mutation Guarantee of Parent Baseline
  // ==========================================
  it('guarantees baseline forecast inputs and outputs were not mutated by what-if scenario deltas', async () => {
    const baselineSummary = await getForecastSummary(orgId, baseForecastId);
    const futurePeriod = baselineSummary.periods.find((p) => p.periodNumber === 4);

    // Baseline future period revenue must remain exactly 1,000 EA * ₹500 = ₹500,000
    expect(futurePeriod?.revenue).toBe(500000);

    // Check PlanInput records in DB for baseline forecast
    const baselineDemandInput = await db.planInput.findFirst({
      where: {
        organizationId: orgId,
        planVersionId: baseForecastId,
        fiscalPeriodId: fiscalPeriods[3].id,
        inputCode: 'DEMAND_VOLUME',
      },
    });
    expect(baselineDemandInput?.inputValue).toBe(1000);
  });

  // ==========================================
  // Test 7: Side-by-Side Multi-Scenario Comparison Matrix
  // ==========================================
  it('computes side-by-side comparison matrix with absolute/percentage variance and favorability', async () => {
    const comparison = await compareScenarios(orgId, baseForecastId, [
      bestCaseScenarioId,
      worstCaseScenarioId,
    ]);

    expect(comparison.baseForecast.code).toBe('FY26-3+9-FCST');
    expect(comparison.scenarios).toHaveLength(2);

    // 1. Best Case comparison
    const bestCase = comparison.scenarios.find((s) => s.scenarioId === bestCaseScenarioId);
    expect(bestCase).toBeDefined();
    expect(bestCase!.metrics.revenue.absoluteVariance).toBeGreaterThan(0);
    expect(bestCase!.metrics.revenue.favorability).toBe('FAVORABLE');
    expect(bestCase!.metrics.grossProfit.favorability).toBe('FAVORABLE');
    expect(bestCase!.metrics.operatingProfit.favorability).toBe('FAVORABLE');

    // 2. Worst Case comparison
    const worstCase = comparison.scenarios.find((s) => s.scenarioId === worstCaseScenarioId);
    expect(worstCase).toBeDefined();
    expect(worstCase!.metrics.revenue.absoluteVariance).toBeLessThan(0);
    expect(worstCase!.metrics.revenue.favorability).toBe('UNFAVORABLE');
    expect(worstCase!.metrics.opex.absoluteVariance).toBeGreaterThan(0);
    expect(worstCase!.metrics.opex.favorability).toBe('UNFAVORABLE');
    expect(worstCase!.metrics.operatingProfit.favorability).toBe('UNFAVORABLE');
  });

  // ==========================================
  // Test 8: Governance Lifecycle & Immutability Enforcement
  // ==========================================
  it('enforces full governance lifecycle (Draft -> Review -> Approve -> Publish -> Lock) and immutability', async () => {
    // 1. Submit for review
    const submitted = await submitForecastForReview(
      orgId,
      plannerUserId,
      baseForecastId,
      'Q1 actuals consolidated and reviewed by manufacturing operations'
    );
    expect(submitted.status).toBe('IN_REVIEW');

    // 2. Approve
    const approved = await approveForecast(
      orgId,
      reviewerUserId,
      baseForecastId,
      'Approved by VP Finance Controller'
    );
    expect(approved.status).toBe('APPROVED');

    // 3. Publish
    const published = await publishForecast(
      orgId,
      reviewerUserId,
      baseForecastId,
      'Official executive forecast published to corporate dashboard'
    );
    expect(published.status).toBe('PUBLISHED');
    expect(published.isPublished).toBe(true);

    // 4. Lock
    const locked = await lockForecast(
      orgId,
      reviewerUserId,
      baseForecastId,
      'Frozen for quarterly investor reporting audit trail'
    );
    expect(locked.status).toBe('LOCKED');
    expect(locked.isLocked).toBe(true);

    // 5. Verify audit / governance logs recorded
    const logs = await db.forecastGovernanceLog.findMany({
      where: { organizationId: orgId, planVersionId: baseForecastId },
      orderBy: { performedAt: 'asc' },
    });
    expect(logs.length).toBeGreaterThanOrEqual(4);

    // 6. Verify locked forecast rejects calculation
    await expect(
      calculateForecast(orgId, plannerUserId, baseForecastId)
    ).rejects.toThrow('Cannot calculate a locked forecast version.');

    // 7. Verify locked forecast rejects delta application
    await expect(
      applyWhatIfDelta(orgId, plannerUserId, baseForecastId, {
        targetCode: 'SELLING_PRICE',
        deltaType: 'PERCENTAGE',
        deltaValue: 5,
      })
    ).rejects.toThrow();
  });

  // ==========================================
  // Test 9: Multi-Tenant Security Isolation
  // ==========================================
  it('prevents external tenant from accessing or manipulating organization forecasts', async () => {
    // External user in otherOrgId attempts to view orgId forecast
    await expect(
      getForecastById(otherOrgId, baseForecastId)
    ).rejects.toThrow('not found');

    // External user attempts to calculate orgId forecast
    await expect(
      calculateForecast(otherOrgId, otherUserId, baseForecastId)
    ).rejects.toThrow('not found');

    // External user attempts to create scenario on orgId forecast
    await expect(
      createScenarioVersion(otherOrgId, otherUserId, {
        baseForecastVersionId: baseForecastId,
        code: 'HACK-SCENARIO',
        name: 'Hacked Scenario',
        scenarioType: 'CUSTOM',
      })
    ).rejects.toThrow('not found');
  });
});
