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
import { createPlanVersion, updatePlanVersionStatus } from '@/server/services/plan-version.service';
import { upsertPlanInput } from '@/server/services/plan-input.service';
import { executeCalculation } from '@/server/services/calculation.service';
import {
  uploadActualsBatch,
  saveMappingProfile,
  validateActualsBatch,
  commitActualsImport,
  lockActualsBatch,
  getActualImportBatches,
} from '@/server/services/actual-import.service';
import { getBatchReconciliationResults } from '@/server/services/reconciliation.service';
import {
  calculatePlanVsActualVariance,
  createVarianceComment,
  updateVarianceComment,
  resolveVarianceComment,
  getVarianceComments,
} from '@/server/services/variance.service';
import { generatePnlReport } from '@/server/services/reporting.service';

describe('Phase 5 Actuals, Reconciliation & Variance Integration', { timeout: 60000 }, () => {
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
    const plannerEmail = `planner-act-${Date.now()}@test.com`;
    const regPlanner = await registerUser({
      email: plannerEmail,
      password: 'Password123!',
      name: 'Actuals Lead Planner',
      organizationName: `Demo Manufacturing Ltd ${Date.now()}`,
    });
    orgId = regPlanner.organization.id;
    plannerUserId = regPlanner.user.id;

    await db.membership.update({
      where: { userId_organizationId: { userId: plannerUserId, organizationId: orgId } },
      data: { role: 'PLANNER' },
    });

    const reviewerUser = await db.user.create({
      data: {
        email: `reviewer-act-${Date.now()}@test.com`,
        passwordHash: 'hashed_pw',
        name: 'Finance Controller Reviewer',
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

    // 2. Setup separate organization to verify tenant isolation
    const regOther = await registerUser({
      email: `other-act-${Date.now()}@test.com`,
      password: 'Password123!',
      name: 'Other Org Planner',
      organizationName: `Isolated Competitor Corp ${Date.now()}`,
    });
    otherOrgId = regOther.organization.id;
    otherUserId = regOther.user.id;

    // 3. Setup Master Data
    const plant = await createPlant(orgId, plannerUserId, {
      code: 'PLANT-CH',
      name: 'Chennai Plant',
      country: 'IN',
      timeZone: 'Asia/Kolkata',
      baseCurrency: 'INR',
      isActive: true,
    });
    plantId = plant.id;

    const product = await createProduct(orgId, plannerUserId, {
      code: 'SKU-PROD-A',
      name: 'Product A',
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
      name: 'Steel Bar',
      category: 'METALS',
      unitOfMeasure: 'KG',
      defaultCostCents: 9000, // 90.00 / KG
      currency: 'INR',
      isActive: true,
      leadTimeDays: 7,
    });
    materialId = material.id;

    // Chart of Accounts (COA)
    await createAccount(orgId, plannerUserId, {
      code: '4010',
      name: 'Finished Goods Product A Sales',
      accountType: 'REVENUE',
      normalBalance: 'CREDIT',
      currency: 'INR',
      isActive: true,
    });
    await createAccount(orgId, plannerUserId, {
      code: '5010',
      name: 'Direct Material Steel Consumption',
      accountType: 'COGS',
      normalBalance: 'DEBIT',
      currency: 'INR',
      isActive: true,
    });
    await createAccount(orgId, plannerUserId, {
      code: '5020',
      name: 'Direct Labor Assembly Wages',
      accountType: 'COGS',
      normalBalance: 'DEBIT',
      currency: 'INR',
      isActive: true,
    });
    await createAccount(orgId, plannerUserId, {
      code: '5030',
      name: 'Factory Manufacturing Overhead',
      accountType: 'COGS',
      normalBalance: 'DEBIT',
      currency: 'INR',
      isActive: true,
    });
    await createAccount(orgId, plannerUserId, {
      code: '6010',
      name: 'General SG&A Expenses',
      accountType: 'OPERATING_EXPENSE',
      normalBalance: 'DEBIT',
      currency: 'INR',
      isActive: true,
    });
    await createAccount(orgId, plannerUserId, {
      code: '6020',
      name: 'R&D Operational Costs',
      accountType: 'OPERATING_EXPENSE',
      normalBalance: 'DEBIT',
      currency: 'INR',
      isActive: true,
    });
    await createAccount(orgId, plannerUserId, {
      code: '6030',
      name: 'Distribution and Logistics',
      accountType: 'OPERATING_EXPENSE',
      normalBalance: 'DEBIT',
      currency: 'INR',
      isActive: true,
    });

    // BOM: 2 KG steel per unit
    const bom = await createBomHeader(orgId, plannerUserId, {
      productId,
      name: 'Product A BOM',
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
      name: 'Product A Assembly Routing',
      isActive: true,
    });
    const routingFull = await getRoutingById(orgId, routing.id);
    const routingVerId = routingFull.versions[0].id;
    await addRoutingOperation(orgId, plannerUserId, routingVerId, {
      sequence: 10,
      operationName: 'Final Assembly',
      workCenter: 'WC-01',
      laborHoursPerUnit: 0.5,
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

    // Fiscal Calendar & Period: Jan 2027
    const calendar = await createFiscalCalendar(orgId, plannerUserId, {
      name: 'FY2027 Standard Calendar',
      startYear: 2027,
      fiscalYearStartMonth: 1,
      calendarType: 'MONTHLY',
    });
    periodId = calendar.periods[0].id; // Jan 2027

    // Planning Cycle & Plan Version
    const cycle = await createPlanningCycle(orgId, plannerUserId, {
      name: 'FY2027 Annual Operating Plan',
      planningType: 'ANNUAL_BUDGET',
      fiscalYear: 2027,
      startPeriodId: periodId,
      endPeriodId: periodId,
    });
    cycleId = cycle.id;

    const version = await createPlanVersion(orgId, plannerUserId, cycleId, {
      versionName: 'Working Draft Baseline V1',
      versionCode: 'V1-APPROVED',
      versionType: 'ORIGINAL_BUDGET',
    });
    versionId = version.id;

    // 4. Create Plan Inputs (Section 25 / Section 20 Demo Scenario)
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
    });

    await upsertPlanInput(orgId, plannerUserId, {
      planningCycleId: cycleId,
      planVersionId: versionId,
      fiscalPeriodId: periodId,
      plantId,
      productId,
      inputCategory: 'DEMAND',
      inputCode: 'SELLING_PRICE',
      inputValue: 500.0,
      unitOfMeasure: 'INR',
      currency: 'INR',
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
    });

    await upsertPlanInput(orgId, plannerUserId, {
      planningCycleId: cycleId,
      planVersionId: versionId,
      fiscalPeriodId: periodId,
      plantId,
      productId,
      inputCategory: 'OVERHEAD',
      inputCode: 'OVERHEAD_COST_PER_UNIT',
      inputValue: 40.0,
      unitOfMeasure: 'INR/EA',
      currency: 'INR',
    });

    await upsertPlanInput(orgId, plannerUserId, {
      planningCycleId: cycleId,
      planVersionId: versionId,
      fiscalPeriodId: periodId,
      inputCategory: 'OPEX',
      inputCode: 'MONTHLY_OPEX',
      inputValue: 100000.0,
      unitOfMeasure: 'INR',
      currency: 'INR',
    });

    // Execute calculation run to populate plan baseline outputs
    const calcResult = await executeCalculation(orgId, plannerUserId, {
      planningCycleId: cycleId,
      planVersionId: versionId,
      fiscalPeriodId: periodId,
      plantId,
      productId,
    });
    expect(['COMPLETED', 'COMPLETED_WITH_WARNINGS']).toContain(calcResult.status);
    expect(calcResult.summary.revenue).toBe(500000);
    expect(calcResult.summary.cogs).toBe(320000);
    expect(calcResult.summary.operatingProfit).toBe(80000);

    // Lock the Plan Version
    await updatePlanVersionStatus(orgId, plannerUserId, versionId, { status: 'IN_REVIEW' });
    await updatePlanVersionStatus(orgId, reviewerUserId, versionId, { status: 'APPROVED' });
    await updatePlanVersionStatus(orgId, reviewerUserId, versionId, { status: 'LOCKED' });
  });

  it('executes full 10-step actuals import, reconciliation, variance, and reporting lifecycle', async () => {
    // -------------------------------------------------------------
    // Step 1: Upload Actuals CSV with SHA-256 Duplicate Check
    // -------------------------------------------------------------
    // Actuals matching Section 20 Demo Acceptance Scenario:
    // Revenue: 520,000; COGS: 330,000 (Mat 198k + Lab 110k + Ovhd 22k); Opex: 110,000 (SG&A 40k + R&D 30k + Dst 40k)
    const csvContent = `Transaction Date,Plant,Product,Account,Amount,Quantity,Description,External Ref
2027-01-15,PLANT-CH,SKU-PROD-A,4010,520000,1040,Finished Goods Product A Invoiced Sales,INV-2027-001
2027-01-20,PLANT-CH,SKU-PROD-A,5010,198000,2200,Steel Material Consumption,MAT-ACT-001
2027-01-25,PLANT-CH,SKU-PROD-A,5020,110000,550,Direct Labor Assembly Wages,LAB-ACT-001
2027-01-28,PLANT-CH,SKU-PROD-A,5030,22000,,Factory Overhead Expense,OVH-ACT-001
2027-01-31,PLANT-CH,,6010,40000,,General SG&A Expenses,OPX-SGA-001
2027-01-31,PLANT-CH,,6020,30000,,R&D Operational Costs,OPX-RND-001
2027-01-31,PLANT-CH,,6030,40000,,Distribution and Logistics,OPX-DST-001`;

    const totalControl = 520000 + 198000 + 110000 + 22000 + 40000 + 30000 + 40000; // 960,000

    const batch = await uploadActualsBatch(orgId, plannerUserId, {
      name: 'January 2027 Complete Actuals Batch',
      originalFileName: 'jan2027_actuals.csv',
      fileContent: csvContent,
      importType: 'GL_ACTUALS',
      fiscalPeriodId: periodId,
      plantId,
      currency: 'INR',
      controlTotal: totalControl,
    });

    expect(batch.id).toBeDefined();
    expect(batch.status).toBe('UPLOADED');
    expect(batch.fileHash).toHaveLength(64);

    // Verify duplicate file upload is rejected
    await expect(
      uploadActualsBatch(orgId, plannerUserId, {
        name: 'Duplicate Upload Attempt',
        originalFileName: 'duplicate_attempt.csv',
        fileContent: csvContent,
        importType: 'GL_ACTUALS',
        fiscalPeriodId: periodId,
      })
    ).rejects.toThrow(/already exists/i);

    // -------------------------------------------------------------
    // Step 2: Configure Column Mapping Profile
    // -------------------------------------------------------------
    const updatedMapping = await saveMappingProfile(orgId, plannerUserId, batch.id, {
      dateColumn: 'Transaction Date',
      plantColumn: 'Plant',
      productColumn: 'Product',
      accountColumn: 'Account',
      amountColumn: 'Amount',
      quantityColumn: 'Quantity',
      descriptionColumn: 'Description',
      externalRefColumn: 'External Ref',
    });
    expect(updatedMapping.status).toBe('PARSING');

    // -------------------------------------------------------------
    // Step 3: Pre-Flight Batch Validation
    // -------------------------------------------------------------
    const validatedBatch = await validateActualsBatch(orgId, plannerUserId, batch.id);
    expect(validatedBatch.status).toBe('VALIDATED');
    expect(validatedBatch.acceptedRowCount).toBe(7);
    expect(validatedBatch.rejectedRowCount).toBe(0);
    expect(validatedBatch.importedTotal).toBe(totalControl);

    // -------------------------------------------------------------
    // Step 4: Transactional Commit
    // -------------------------------------------------------------
    const committedBatch = await commitActualsImport(orgId, plannerUserId, batch.id);
    expect(committedBatch.status).toBe('IMPORTED');
    expect(committedBatch.importedById).toBe(plannerUserId);

    // Check records materialized in database
    const financialRecords = await db.actualFinancialRecord.findMany({
      where: { importBatchId: batch.id },
    });
    expect(financialRecords).toHaveLength(7);

    // -------------------------------------------------------------
    // Step 5: Automated Reconciliation Checks
    // -------------------------------------------------------------
    const reconResults = await getBatchReconciliationResults(orgId, batch.id);
    expect(reconResults.length).toBeGreaterThanOrEqual(3);

    // Verify control total check passed
    const controlCheck = reconResults.find((r) => r.reconciliationType === 'FILE_CONTROL_TOTAL');
    expect(controlCheck).toBeDefined();
    expect(controlCheck?.status).toBe('BALANCED');
    expect(controlCheck?.difference).toBe(0);

    // Verify period integrity check passed
    const periodCheck = reconResults.find((r) => r.reconciliationType === 'PERIOD_INTEGRITY');
    expect(periodCheck).toBeDefined();
    expect(periodCheck?.status).toBe('BALANCED');

    // -------------------------------------------------------------
    // Step 6: Plan vs Actual Variance Engine Execution
    // -------------------------------------------------------------
    const comparison = await calculatePlanVsActualVariance(orgId, {
      planVersionId: versionId,
      fiscalPeriodId: periodId,
      plantId,
      productId,
    });

    expect(comparison.currency).toBe('INR');

    // Verify Section 20 Demo Scenario Exact Figures:
    // Revenue: Plan 500,000, Actual 520,000 -> Diff +20,000, Favorable (+4.0%)
    const rev = comparison.items.find((i) => i.metricCode === 'REVENUE')!;
    expect(rev.planValue).toBe(500000);
    expect(rev.actualValue).toBe(520000);
    expect(rev.varianceAmount).toBe(20000);
    expect(rev.variancePercent).toBe(4.0);
    expect(rev.favorability).toBe('FAVORABLE');

    // COGS: Plan 320,000, Actual 330,000 (198k + 110k + 22k) -> Diff +10,000, Unfavorable (+3.125%)
    const cogs = comparison.items.find((i) => i.metricCode === 'COGS')!;
    expect(cogs.planValue).toBe(320000);
    expect(cogs.actualValue).toBe(330000);
    expect(cogs.varianceAmount).toBe(10000);
    expect(cogs.variancePercent).toBe(3.125);
    expect(cogs.favorability).toBe('UNFAVORABLE');

    // Gross Profit: Plan 180,000, Actual 190,000 -> Diff +10,000, Favorable (+5.556%)
    const gp = comparison.items.find((i) => i.metricCode === 'GROSS_PROFIT')!;
    expect(gp.planValue).toBe(180000);
    expect(gp.actualValue).toBe(190000);
    expect(gp.varianceAmount).toBe(10000);
    expect(gp.variancePercent).toBeCloseTo(5.556, 2);
    expect(gp.favorability).toBe('FAVORABLE');

    // Opex: Plan 100,000, Actual 110,000 (40k + 30k + 40k) -> Diff +10,000, Unfavorable (+10.0%)
    const opex = comparison.items.find((i) => i.metricCode === 'OPEX')!;
    expect(opex.planValue).toBe(100000);
    expect(opex.actualValue).toBe(110000);
    expect(opex.varianceAmount).toBe(10000);
    expect(opex.variancePercent).toBe(10.0);
    expect(opex.favorability).toBe('UNFAVORABLE');

    // Operating Profit (EBIT): Plan 80,000, Actual 80,000 -> Diff 0, Neutral (0.0%)
    const ebit = comparison.items.find((i) => i.metricCode === 'OPERATING_PROFIT')!;
    expect(ebit.planValue).toBe(80000);
    expect(ebit.actualValue).toBe(80000);
    expect(ebit.varianceAmount).toBe(0);
    expect(ebit.variancePercent).toBe(0.0);
    expect(ebit.favorability).toBe('NEUTRAL');

    // -------------------------------------------------------------
    // Step 7: Variance Commentary & Resolution Workflow
    // -------------------------------------------------------------
    const comment = await createVarianceComment(orgId, plannerUserId, {
      planningCycleId: cycleId,
      planVersionId: versionId,
      fiscalPeriodId: periodId,
      plantId,
      productId,
      metricCode: 'COGS',
      varianceAmount: 10000,
      variancePercent: 3.125,
      favorability: 'UNFAVORABLE',
      rootCauseCategory: 'OVERHEAD',
      comment: 'Unfavorable COGS caused by unplanned utility rate surcharge in January.',
      actionOwner: 'Plant Facilities Manager',
      dueDate: '2027-02-15',
    });
    expect(comment.id).toBeDefined();
    expect(comment.status).toBe('OPEN');

    // Reviewer updates comment status
    const updatedComment = await updateVarianceComment(orgId, reviewerUserId, comment.id, {
      status: 'UNDER_REVIEW',
    });
    expect(updatedComment.status).toBe('UNDER_REVIEW');

    // Resolve comment
    const resolvedComment = await resolveVarianceComment(
      orgId,
      reviewerUserId,
      comment.id,
      'Negotiated fixed tariff with municipal power utility for subsequent periods.'
    );
    expect(resolvedComment.status).toBe('RESOLVED');
    expect(resolvedComment.resolutionNotes).toContain('Negotiated fixed tariff');

    // -------------------------------------------------------------
    // Step 8: Financial Reporting Statements Generation
    // -------------------------------------------------------------
    const pnlReport = await generatePnlReport(orgId, {
      planVersionId: versionId,
      fiscalPeriodId: periodId,
      plantId,
      productId,
    });
    expect(pnlReport.reportTitle).toContain('P&L');
    expect(pnlReport.lines).toHaveLength(5);

    // -------------------------------------------------------------
    // Step 9: Batch Locking and Immutability Verification
    // -------------------------------------------------------------
    const lockedBatch = await lockActualsBatch(orgId, reviewerUserId, batch.id);
    expect(lockedBatch.status).toBe('LOCKED');
    expect(lockedBatch.lockedById).toBe(reviewerUserId);

    // Verify mutations fail on locked batch
    await expect(
      saveMappingProfile(orgId, plannerUserId, batch.id, { amountColumn: 'Amount' })
    ).rejects.toThrow(/cannot modify/i);

    // -------------------------------------------------------------
    // Step 10: Multi-Tenant Data Isolation Enforcement
    // -------------------------------------------------------------
    const otherBatches = await getActualImportBatches(otherOrgId);
    expect(otherBatches).toHaveLength(0);

    const otherComments = await getVarianceComments(otherOrgId, { planVersionId: versionId });
    expect(otherComments).toHaveLength(0);
  });
});
