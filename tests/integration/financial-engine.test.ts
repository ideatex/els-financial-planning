import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '@/lib/db';
import { registerUser } from '@/server/services/auth.service';
import { createPlant } from '@/server/services/plant.service';
import { createProduct } from '@/server/services/product.service';
import { createMaterial } from '@/server/services/material.service';
import { createBomHeader, getBomById, addBomLine } from '@/server/services/bom.service';
import { createRoutingHeader, getRoutingById, addRoutingOperation } from '@/server/services/routing.service';
import { createFiscalCalendar } from '@/server/services/calendar.service';
import { createPlanningCycle } from '@/server/services/planning-cycle.service';
import { createPlanVersion, updatePlanVersionStatus } from '@/server/services/plan-version.service';
import { upsertPlanInput } from '@/server/services/plan-input.service';
import {
  checkReadiness,
  executeCalculation,
  getCalculationRuns,
  getCalculationRunById,
  getLatestSuccessfulRun,
  retryCalculationRun,
} from '@/server/services/calculation.service';
import { CalculationRunStatus } from '@/financial-engine/domain/enums';
import { PlanLockedError } from '@/financial-engine/domain/errors';

describe('Phase 4 Financial Engine Integration & 10-Step E2E Lifecycle', { timeout: 60000 }, () => {
  let orgId: string;
  let plannerUserId: string;
  let reviewerUserId: string;

  let otherOrgId: string;
  let otherUserId: string;

  let plantId: string;
  let productId: string;
  let materialId: string;
  let periodId: string;
  let cycleId: string;
  let versionId: string;

  beforeAll(async () => {
    // 1. Setup primary organization with planner & reviewer
    const plannerEmail = `planner-calc-${Date.now()}@test.com`;
    const regPlanner = await registerUser({
      email: plannerEmail,
      password: 'Password123!',
      name: 'Primary Planner',
      organizationName: `Apex Engine Corp ${Date.now()}`,
    });
    orgId = regPlanner.organization.id;
    plannerUserId = regPlanner.user.id;

    // Update role to PLANNER
    await db.membership.update({
      where: { userId_organizationId: { userId: plannerUserId, organizationId: orgId } },
      data: { role: 'PLANNER' },
    });

    // Add Reviewer
    const reviewerUser = await db.user.create({
      data: {
        email: `reviewer-calc-${Date.now()}@test.com`,
        passwordHash: 'hash',
        name: 'Finance Reviewer',
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

    // 2. Setup secondary organization for multi-tenant isolation testing
    const regOther = await registerUser({
      email: `other-calc-${Date.now()}@test.com`,
      password: 'Password123!',
      name: 'Other Org Planner',
      organizationName: `Other Manufacturing ${Date.now()}`,
    });
    otherOrgId = regOther.organization.id;
    otherUserId = regOther.user.id;

    // 3. Setup Master Data in Primary Org
    const plant = await createPlant(orgId, plannerUserId, {
      code: 'PLANT-CH',
      name: 'Chennai Manufacturing Plant',
      country: 'IN',
      timeZone: 'Asia/Kolkata',
      baseCurrency: 'INR',
      isActive: true,
    });
    plantId = plant.id;

    const product = await createProduct(orgId, plannerUserId, {
      code: 'SKU-PROD-A',
      name: 'Precision Actuator Product A',
      category: 'ACTUATOR',
      productType: 'FINISHED_GOOD',
      unitOfMeasure: 'EA',
      standardPriceCents: 50000, // 500.00
      currency: 'INR',
      defaultPlantId: plantId,
      isActive: true,
    });
    productId = product.id;

    const material = await createMaterial(orgId, plannerUserId, {
      code: 'MAT-STEEL-01',
      name: 'Precision Rolled Steel',
      category: 'METALS',
      unitOfMeasure: 'KG',
      defaultCostCents: 9000, // 90.00 / KG
      currency: 'INR',
      isActive: true,
      leadTimeDays: 7,
    });
    materialId = material.id;

    // BOM: 2 KG per unit @ 90.00 = 180.00 Material Cost
    const bom = await createBomHeader(orgId, plannerUserId, {
      productId,
      name: 'Actuator Product A BOM',
      isActive: true,
    });
    const bomFull = await getBomById(orgId, bom.id);
    const bomVerId = bomFull.versions[0].id;
    await addBomLine(orgId, plannerUserId, bomVerId, {
      componentType: 'MATERIAL',
      materialId,
      quantityPerUnit: 2.0,
      unitOfMeasure: 'KG',
      scrapPercentage: 0,
    });
    await db.bomVersion.update({
      where: { id: bomVerId },
      data: { status: 'APPROVED' },
    });

    // Routing: 0.5 hours per unit
    const routing = await createRoutingHeader(orgId, plannerUserId, {
      productId,
      plantId,
      name: 'Actuator Final Assembly Routing',
      isActive: true,
    });
    const routingFull = await getRoutingById(orgId, routing.id);
    const routingVerId = routingFull.versions[0].id;
    await addRoutingOperation(orgId, plannerUserId, routingVerId, {
      sequence: 10,
      operationName: 'Final Robotic Assembly',
      workCenter: 'WC-ROBOT-01',
      laborHoursPerUnit: 0.5,
    });
    await db.routingVersion.update({
      where: { id: routingVerId },
      data: { status: 'APPROVED' },
    });

    // Driver: Labor Rate = 200 INR/hr
    await db.driver.create({
      data: {
        organizationId: orgId,
        driverCode: 'DRV-LABOR-01',
        driverName: 'Chennai Assembly Labor Wage',
        driverCategory: 'LABOR',
        driverType: 'RATE',
        unitOfMeasure: 'INR/HR',
        defaultValue: 200.0,
        currency: 'INR',
        isActive: true,
      },
    });

    // Calendar and Period
    const cal = await createFiscalCalendar(orgId, plannerUserId, {
      name: 'Fiscal Year 2027 Calendar',
      fiscalYearStartMonth: 1,
      calendarType: 'MONTHLY',
      startYear: 2027,
    });
    const periods = await db.fiscalPeriod.findMany({
      where: { fiscalCalendarId: cal.id, periodNumber: 1 },
    });
    periodId = periods[0].id;

    // Planning Cycle & Version
    const cycle = await createPlanningCycle(orgId, plannerUserId, {
      name: 'FY2027 Annual Operating Plan',
      planningType: 'ANNUAL_BUDGET',
      fiscalYear: 2027,
      startPeriodId: periodId,
      endPeriodId: periodId,
    });
    cycleId = cycle.id;

    const version = await createPlanVersion(orgId, plannerUserId, cycleId, {
      versionCode: 'V1-BASE',
      versionName: '2027 Base Operating Model',
      versionType: 'BASE_CASE',
    });
    versionId = version.id;

    // Seed Section 25 Inputs
    await upsertPlanInput(orgId, plannerUserId, {
      planningCycleId: cycleId,
      planVersionId: versionId,
      fiscalPeriodId: periodId,
      plantId,
      productId,
      inputCategory: 'DEMAND',
      inputCode: 'SALES_VOLUME',
      inputValue: 1000,
      unitOfMeasure: 'EA',
      currency: 'INR',
      sourceType: 'MANUAL',
    });

    await upsertPlanInput(orgId, plannerUserId, {
      planningCycleId: cycleId,
      planVersionId: versionId,
      fiscalPeriodId: periodId,
      plantId,
      productId,
      inputCategory: 'DEMAND',
      inputCode: 'SELLING_PRICE',
      inputValue: 500,
      unitOfMeasure: 'INR',
      currency: 'INR',
      sourceType: 'MANUAL',
    });

    await upsertPlanInput(orgId, plannerUserId, {
      planningCycleId: cycleId,
      planVersionId: versionId,
      fiscalPeriodId: periodId,
      plantId,
      productId,
      inputCategory: 'PRODUCTION',
      inputCode: 'BEGINNING_INVENTORY',
      inputValue: 100,
      unitOfMeasure: 'EA',
      currency: 'INR',
      sourceType: 'MANUAL',
    });

    await upsertPlanInput(orgId, plannerUserId, {
      planningCycleId: cycleId,
      planVersionId: versionId,
      fiscalPeriodId: periodId,
      plantId,
      productId,
      inputCategory: 'PRODUCTION',
      inputCode: 'TARGET_ENDING_INVENTORY',
      inputValue: 200,
      unitOfMeasure: 'EA',
      currency: 'INR',
      sourceType: 'MANUAL',
    });

    await upsertPlanInput(orgId, plannerUserId, {
      planningCycleId: cycleId,
      planVersionId: versionId,
      fiscalPeriodId: periodId,
      plantId,
      productId,
      inputCategory: 'OVERHEAD',
      inputCode: 'OVERHEAD_COST_PER_UNIT',
      inputValue: 40,
      unitOfMeasure: 'INR/EA',
      currency: 'INR',
      sourceType: 'MANUAL',
    });

    await upsertPlanInput(orgId, plannerUserId, {
      planningCycleId: cycleId,
      planVersionId: versionId,
      fiscalPeriodId: periodId,
      inputCategory: 'OPEX',
      inputCode: 'MONTHLY_OPEX',
      inputValue: 100000,
      unitOfMeasure: 'INR',
      currency: 'INR',
      sourceType: 'MANUAL',
    });
  });

  it('executes full 10-step end-to-end planning & calculation lifecycle', async () => {
    // Step 1: Planner opens editable plan version
    const version = await db.planVersion.findFirst({
      where: { id: versionId, organizationId: orgId },
    });
    expect(version).toBeDefined();
    expect(version?.status).toBe('DRAFT');

    // Step 2: Planner checks input readiness
    const readiness = await checkReadiness(orgId, {
      planningCycleId: cycleId,
      planVersionId: versionId,
      fiscalPeriodId: periodId,
      plantId,
      productId,
    });
    expect(readiness.report.isReady).toBe(true);
    expect(readiness.report.scorePercentage).toBe(100);
    expect(readiness.report.blockers.length).toBe(0);

    // Step 3: Planner starts calculation
    // Step 4: System displays calculation progress & executes pipeline
    // Step 5: System completes calculation
    const calcResult = await executeCalculation(orgId, plannerUserId, {
      planningCycleId: cycleId,
      planVersionId: versionId,
      fiscalPeriodId: periodId,
      plantId,
      productId,
    });

    expect(calcResult.status).toBe(CalculationRunStatus.COMPLETED);
    expect(calcResult.errorCount).toBe(0);
    expect(calcResult.durationMs).toBeGreaterThanOrEqual(0);

    // Step 6: Planner views financial results
    const s = calcResult.summary;
    expect(s.revenue).toBe(500000);
    expect(s.netProductionQuantity).toBe(1100);
    expect(s.materialCost).toBe(198000);
    expect(s.laborCost).toBe(110000);
    expect(s.overheadCost).toBe(44000);
    expect(s.totalProductionCost).toBe(352000);
    expect(s.standardUnitCost).toBe(320);
    expect(s.cogs).toBe(320000);
    expect(s.grossProfit).toBe(180000);
    expect(s.grossMarginPercentage).toBe(36.0);
    expect(s.totalOpex).toBe(100000);
    expect(s.operatingProfit).toBe(80000);
    expect(s.operatingMarginPercentage).toBe(16.0);

    // Step 7: Planner opens material and labor drill-down
    expect(s.materialCostDrillDown.length).toBe(1);
    expect(s.materialCostDrillDown[0].materialCode).toBe('MAT-STEEL-01');
    expect(s.materialCostDrillDown[0].extendedTotalCost).toBe(198000);

    expect(s.laborCostDrillDown.length).toBe(1);
    expect(s.laborCostDrillDown[0].operationName).toBe('Final Robotic Assembly');
    expect(s.laborCostDrillDown[0].extendedTotalCost).toBe(110000);

    // Verify persisted outputs in database
    const savedRun = await getCalculationRunById(orgId, calcResult.runId);
    expect(savedRun).toBeDefined();
    expect(savedRun.outputs.length).toBeGreaterThan(10);

    const revOutput = savedRun.outputs.find((o) => o.outputCode === 'GROSS_REVENUE');
    expect(revOutput?.outputValue).toBe(500000);

    // Step 8: Reviewer views calculation
    const reviewerRuns = await getCalculationRuns(orgId, { planVersionId: versionId });
    expect(reviewerRuns.length).toBeGreaterThanOrEqual(1);
    expect(reviewerRuns[0].status).toBe(CalculationRunStatus.COMPLETED);

    // Step 9: Locked plan cannot be modified or re-calculated
    // Transition version: DRAFT -> IN_REVIEW -> APPROVED -> LOCKED
    await updatePlanVersionStatus(orgId, plannerUserId, versionId, { status: 'IN_REVIEW' });
    await updatePlanVersionStatus(orgId, reviewerUserId, versionId, { status: 'APPROVED' });
    await updatePlanVersionStatus(orgId, reviewerUserId, versionId, { status: 'LOCKED' });

    // Attempting calculation on locked version must throw PlanLockedError
    await expect(
      executeCalculation(orgId, plannerUserId, {
        planningCycleId: cycleId,
        planVersionId: versionId,
        fiscalPeriodId: periodId,
        plantId,
        productId,
      })
    ).rejects.toThrow(PlanLockedError);

    // Step 10: Unauthorized users from other organization cannot view or run calculation
    await expect(
      getCalculationRunById(otherOrgId, calcResult.runId)
    ).rejects.toThrow('Calculation Run not found');

    const otherRuns = await getCalculationRuns(otherOrgId, {});
    expect(otherRuns.length).toBe(0);
  });

  it('supports calculation retry and latest successful run retrieval', async () => {
    // Create new editable version
    const retryVersion = await createPlanVersion(orgId, plannerUserId, cycleId, {
      versionCode: 'V2-RETRY',
      versionName: 'Retry Verification Version',
      versionType: 'FORECAST',
    });

    // Seed sales quantity and price
    await upsertPlanInput(orgId, plannerUserId, {
      planningCycleId: cycleId,
      planVersionId: retryVersion.id,
      fiscalPeriodId: periodId,
      plantId,
      productId,
      inputCategory: 'DEMAND',
      inputCode: 'SALES_VOLUME',
      inputValue: 500,
      unitOfMeasure: 'EA',
      currency: 'INR',
      sourceType: 'MANUAL',
    });

    await upsertPlanInput(orgId, plannerUserId, {
      planningCycleId: cycleId,
      planVersionId: retryVersion.id,
      fiscalPeriodId: periodId,
      plantId,
      productId,
      inputCategory: 'DEMAND',
      inputCode: 'SELLING_PRICE',
      inputValue: 600,
      unitOfMeasure: 'INR',
      currency: 'INR',
      sourceType: 'MANUAL',
    });

    const runResult = await executeCalculation(orgId, plannerUserId, {
      planningCycleId: cycleId,
      planVersionId: retryVersion.id,
      fiscalPeriodId: periodId,
      plantId,
      productId,
    });

    expect(runResult.status).toBe(CalculationRunStatus.COMPLETED);
    expect(runResult.summary.revenue).toBe(300000); // 500 * 600

    // Test getLatestSuccessfulRun
    const latest = await getLatestSuccessfulRun(orgId, {
      planVersionId: retryVersion.id,
      fiscalPeriodId: periodId,
      plantId,
      productId,
    });
    expect(latest).toBeDefined();
    expect(latest?.id).toBe(runResult.runId);

    // Test retry
    const retryResult = await retryCalculationRun(orgId, plannerUserId, runResult.runId);
    expect(retryResult.status).toBe(CalculationRunStatus.COMPLETED);
    expect(retryResult.summary.revenue).toBe(300000);
  });
});
