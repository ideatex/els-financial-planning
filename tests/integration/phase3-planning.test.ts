import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '@/lib/db';
import { registerUser } from '@/server/services/auth.service';
import { createPlant } from '@/server/services/plant.service';
import { createProduct } from '@/server/services/product.service';
import { createMaterial } from '@/server/services/material.service';
import { createFiscalCalendar, updatePeriodStatus } from '@/server/services/calendar.service';
import { createPlanningCycle } from '@/server/services/planning-cycle.service';
import { createPlanVersion, updatePlanVersionStatus } from '@/server/services/plan-version.service';
import {
  createTarget,
  getTargets,
  getTargetById,
  updateTarget,
  updateTargetStatus,
  bulkImportTargets,
  deleteTarget,
} from '@/server/services/management-target.service';
import {
  createAssumption,
  getAssumptions,
  getAssumptionById,
  updateAssumption,
  copyAssumptions,
  deleteAssumption,
} from '@/server/services/assumption.service';
import {
  createDriver,
  getDrivers,
  getDriverById,
  updateDriver,
  setPlanDriverValue,
  getPlanDriverValues,
  deleteDriver,
} from '@/server/services/driver.service';
import {
  upsertPlanInput,
  batchUpsertPlanInputs,
  getPlanInputs,
  getPlanInputById,
  deletePlanInput,
} from '@/server/services/plan-input.service';
import { copyVersionData } from '@/server/services/version-copy.service';
import { compareVersions } from '@/server/services/version-comparison.service';
import { ConflictError, ValidationError, NotFoundError } from '@/core/errors/AppError';

describe('Phase 3 Planning Inputs, Targets, Assumptions & Drivers Integration', () => {
  let orgId: string;
  let adminUserId: string;
  let otherOrgId: string;
  let otherUserId: string;

  let plantId: string;
  let productId: string;
  let materialId: string;
  let calendarId: string;
  let period1Id: string;
  let period2Id: string;
  let cycleId: string;
  let baseVersionId: string;
  let draftVersionId: string;

  beforeAll(async () => {
    // 1. Setup primary organization & admin
    const email = `phase3-admin-${Date.now()}@test.com`;
    const reg = await registerUser({
      email,
      password: 'Password123!',
      name: 'Phase 3 Admin',
      organizationName: `Phase 3 Precision Corp ${Date.now()}`,
    });
    orgId = reg.organization.id;
    adminUserId = reg.user.id;

    // 2. Setup secondary organization for multi-tenant isolation testing
    const otherEmail = `other-org-${Date.now()}@test.com`;
    const otherReg = await registerUser({
      email: otherEmail,
      password: 'Password123!',
      name: 'Other Org User',
      organizationName: `Other Enterprise ${Date.now()}`,
    });
    otherOrgId = otherReg.organization.id;
    otherUserId = otherReg.user.id;

    // 3. Setup Master Data
    const plant = await createPlant(orgId, adminUserId, {
      code: 'DET-01',
      name: 'Detroit Heavy Assembly',
      city: 'Detroit',
      country: 'USA',
      timeZone: 'America/Detroit',
      baseCurrency: 'USD',
      isActive: true,
    });
    plantId = plant.id;

    const prod = await createProduct(orgId, adminUserId, {
      code: 'FG-PUMP-100',
      name: 'Hydraulic Piston Pump 100',
      category: 'Pumps',
      productType: 'FINISHED_GOOD',
      unitOfMeasure: 'EA',
      standardPriceCents: 52000,
      currency: 'USD',
      isActive: true,
    });
    productId = prod.id;

    const mat = await createMaterial(orgId, adminUserId, {
      code: 'RM-CASTING-01',
      name: 'Cast Iron Housing Body',
      category: 'Castings',
      unitOfMeasure: 'EA',
      defaultCostCents: 4500,
      currency: 'USD',
      leadTimeDays: 21,
      isActive: true,
    });
    materialId = mat.id;

    const cal = await createFiscalCalendar(orgId, adminUserId, {
      name: 'FY2026 Fiscal Calendar',
      fiscalYearStartMonth: 1,
      startYear: 2026,
      calendarType: 'MONTHLY',
    });
    calendarId = cal.id;
    period1Id = cal.periods[0].id;
    period2Id = cal.periods[1].id;

    const cycle = await createPlanningCycle(orgId, adminUserId, {
      name: 'FY2026 Annual Plan',
      planningType: 'ANNUAL_BUDGET',
      fiscalYear: 2026,
      startPeriodId: period1Id,
      endPeriodId: period2Id,
    });
    cycleId = cycle.id;

    // Create Base Plan Version (DRAFT initially)
    const baseVer = await createPlanVersion(orgId, adminUserId, cycleId, {
      versionCode: 'V1-BASE',
      versionName: 'Operating Baseline FY26',
      versionType: 'BASE_CASE',
    });
    baseVersionId = baseVer.id;

    // Create a secondary draft version for scenario comparison & copy tests
    const draftVer = await createPlanVersion(orgId, adminUserId, cycleId, {
      versionCode: 'V2-SCENARIO',
      versionName: 'Stretch Goal Scenario',
      versionType: 'BEST_CASE',
    });
    draftVersionId = draftVer.id;
  });

  // =========================================================================
  // 1. Management Target Intake & Status Workflow
  // =========================================================================
  describe('1. Management Target Intake & Workflow', () => {
    let createdTargetId: string;

    it('creates a management target with dimensional grain', async () => {
      const target = await createTarget(orgId, adminUserId, {
        planningCycleId: cycleId,
        planVersionId: baseVersionId,
        fiscalPeriodId: period1Id,
        plantId,
        productId,
        targetMetric: 'SALES_QUANTITY',
        targetValue: 4500,
        unitOfMeasure: 'EA',
        sourceType: 'MANAGEMENT_SUBMISSION',
        notes: 'Commercial commit from sales VP',
      });

      expect(target).toBeDefined();
      expect(target.id).toBeDefined();
      expect(target.targetMetric).toBe('SALES_QUANTITY');
      expect(target.targetValue).toBe(4500);
      expect(target.status).toBe('DRAFT');
      createdTargetId = target.id;
    });

    it('prevents duplicate targets with identical dimensional grain', async () => {
      await expect(
        createTarget(orgId, adminUserId, {
          planningCycleId: cycleId,
          planVersionId: baseVersionId,
          fiscalPeriodId: period1Id,
          plantId,
          productId,
          targetMetric: 'SALES_QUANTITY',
          targetValue: 6000,
          unitOfMeasure: 'EA',
        })
      ).rejects.toThrow(ConflictError);
    });

    it('updates a management target value and notes', async () => {
      const updated = await updateTarget(orgId, adminUserId, createdTargetId, {
        targetValue: 4800,
        notes: 'Adjusted after territory realign',
      });

      expect(updated.targetValue).toBe(4800);
      expect(updated.notes).toBe('Adjusted after territory realign');
    });

    it('progresses target status through DRAFT -> SUBMITTED -> APPROVED', async () => {
      // DRAFT -> SUBMITTED
      const submitted = await updateTargetStatus(orgId, adminUserId, createdTargetId, {
        status: 'SUBMITTED',
      });
      expect(submitted.status).toBe('SUBMITTED');

      // SUBMITTED -> APPROVED
      const approved = await updateTargetStatus(orgId, adminUserId, createdTargetId, {
        status: 'APPROVED',
      });
      expect(approved.status).toBe('APPROVED');
    });

    it('imports bulk targets via bulkImportTargets', async () => {
      const result = await bulkImportTargets(
        orgId,
        adminUserId,
        {
          planningCycleId: cycleId,
          planVersionId: baseVersionId,
          fileName: 'executive_targets.csv',
          rows: [
            {
              fiscalPeriodId: period2Id,
              targetMetric: 'REVENUE',
              targetValue: 2500000,
              unitOfMeasure: 'USD',
              notes: 'Executive Revenue Minimum',
            },
            {
              fiscalPeriodId: period2Id,
              targetMetric: 'PRODUCTION_QUANTITY',
              targetValue: 5000,
              unitOfMeasure: 'EA',
              plantId,
              productId,
              notes: 'Plant Detroit Assembly Target',
            },
            {
              fiscalPeriodId: period2Id,
              targetMetric: 'GROSS_MARGIN_PERCENT',
              targetValue: 44.5,
              unitOfMeasure: 'PERCENT',
              notes: 'Margin Floor Target',
            },
          ],
        },
        true // commit
      );

      expect(result.totalRows).toBe(3);
      expect(result.validRows).toBe(3);
      expect(result.invalidRows).toBe(0);

      const targets = await getTargets(orgId, {
        planVersionId: baseVersionId,
        fiscalPeriodId: period2Id,
      });
      expect(targets.length).toBe(3);
    });
  });

  // =========================================================================
  // 2. Assumption Management across Categories & Value Types
  // =========================================================================
  describe('2. Assumption Management across Categories & Value Types', () => {
    let priceAssumptionId: string;

    it('creates typed assumptions (CURRENCY, PERCENTAGE, BOOLEAN, TEXT)', async () => {
      // 1. Currency Price assumption
      const price = await createAssumption(orgId, adminUserId, {
        planningCycleId: cycleId,
        planVersionId: baseVersionId,
        code: 'BASE_PUMP_PRICE',
        name: 'Baseline Piston Pump Selling Price',
        category: 'PRICING',
        valueType: 'CURRENCY',
        numericValue: 520.0,
        unit: 'USD',
        productId,
        confidenceLevel: 'HIGH',
        source: 'Catalog 2026',
      });
      expect(price.code).toBe('BASE_PUMP_PRICE');
      expect(price.numericValue).toBe(520.0);
      priceAssumptionId = price.id;

      // 2. Percentage Tax assumption
      const tax = await createAssumption(orgId, adminUserId, {
        planningCycleId: cycleId,
        planVersionId: baseVersionId,
        code: 'STATUTORY_TAX_RATE',
        name: 'Statutory Corporate Tax Rate',
        category: 'TAX',
        valueType: 'PERCENTAGE',
        numericValue: 21.0,
        unit: '%',
        confidenceLevel: 'HIGH',
      });
      expect(tax.numericValue).toBe(21.0);

      // 3. Boolean assumption
      const boolAssump = await createAssumption(orgId, adminUserId, {
        planningCycleId: cycleId,
        planVersionId: baseVersionId,
        code: 'TIER_1_SUPPLIER_REBATE',
        name: 'Tier 1 Supplier Volume Rebate Active',
        category: 'MATERIAL_COST',
        valueType: 'BOOLEAN',
        booleanValue: true,
      });
      expect(boolAssump.booleanValue).toBe(true);

      // 4. Text assumption
      const textAssump = await createAssumption(orgId, adminUserId, {
        planningCycleId: cycleId,
        planVersionId: baseVersionId,
        code: 'LABOR_CONTRACT_STATUS',
        name: 'Union Labor Contract Ratification Status',
        category: 'LABOR_COST',
        valueType: 'TEXT',
        textValue: 'Ratified through Dec 2028',
      });
      expect(textAssump.textValue).toBe('Ratified through Dec 2028');
    });

    it('rejects duplicate assumption codes within same plan version', async () => {
      await expect(
        createAssumption(orgId, adminUserId, {
          planningCycleId: cycleId,
          planVersionId: baseVersionId,
          code: 'BASE_PUMP_PRICE',
          name: 'Duplicate Price',
          category: 'PRICING',
          valueType: 'CURRENCY',
          numericValue: 550.0,
        })
      ).rejects.toThrow(ConflictError);
    });

    it('copies assumptions between plan versions with SKIP and OVERWRITE policy', async () => {
      // First copy: copies 4 assumptions to draftVersionId
      const copy1 = await copyAssumptions(orgId, adminUserId, {
        sourceVersionId: baseVersionId,
        targetVersionId: draftVersionId,
        overwritePolicy: 'SKIP',
      });
      expect(copy1.copiedCount).toBe(4);
      expect(copy1.skippedCount).toBe(0);

      // Second copy with overwritePolicy = 'SKIP' -> all 4 should be skipped
      const copy2 = await copyAssumptions(orgId, adminUserId, {
        sourceVersionId: baseVersionId,
        targetVersionId: draftVersionId,
        overwritePolicy: 'SKIP',
      });
      expect(copy2.copiedCount).toBe(0);
      expect(copy2.skippedCount).toBe(4);

      // Third copy with overwritePolicy = 'OVERWRITE' -> 4 overwritten
      const copy3 = await copyAssumptions(orgId, adminUserId, {
        sourceVersionId: baseVersionId,
        targetVersionId: draftVersionId,
        overwritePolicy: 'OVERWRITE',
      });
      expect(copy3.overwrittenCount).toBe(4);
    });
  });

  // =========================================================================
  // 3. Operational & Financial Drivers Library & Plan Version Overrides
  // =========================================================================
  describe('3. Drivers Library & Plan Overrides', () => {
    let oeeDriverId: string;
    let scrapDriverId: string;

    it('creates global drivers in library', async () => {
      const oee = await createDriver(orgId, adminUserId, {
        driverCode: 'DRV-OEE-DETROIT',
        driverName: 'Detroit CNC Machining OEE',
        driverCategory: 'MACHINE',
        driverType: 'PERCENTAGE',
        unitOfMeasure: '%',
        defaultValue: 82.5,
      });
      expect(oee.driverCode).toBe('DRV-OEE-DETROIT');
      oeeDriverId = oee.id;

      const scrap = await createDriver(orgId, adminUserId, {
        driverCode: 'DRV-SCRAP-CASTING',
        driverName: 'Cast Iron Scrap Allowance Rate',
        driverCategory: 'MATERIAL',
        driverType: 'PERCENTAGE',
        unitOfMeasure: '%',
        defaultValue: 3.0,
      });
      scrapDriverId = scrap.id;
    });

    it('enforces mandatory override reason when driver is overridden in a plan version', async () => {
      // 1. Missing override reason -> throws validation error
      await expect(
        setPlanDriverValue(orgId, adminUserId, {
          planVersionId: draftVersionId,
          driverId: oeeDriverId,
          driverValue: 88.0,
          isOverridden: true,
          overrideReason: '',
        })
      ).rejects.toThrow();

      // 2. Providing valid reason -> succeeds
      const overridden = await setPlanDriverValue(orgId, adminUserId, {
        planVersionId: draftVersionId,
        driverId: oeeDriverId,
        driverValue: 88.0,
        isOverridden: true,
        overrideReason: 'New dual-spindle machining centers arriving in Q1',
      });
      expect(overridden.driverValue).toBe(88.0);
      expect(overridden.isOverridden).toBe(true);
      expect(overridden.overrideReason).toBe('New dual-spindle machining centers arriving in Q1');
    });

    it('retrieves plan driver values merged with defaults for non-overridden drivers', async () => {
      const planDrivers = await getPlanDriverValues(orgId, {
        planVersionId: draftVersionId,
      });

      expect(planDrivers.length).toBeGreaterThanOrEqual(1);
      const oeeEntry = planDrivers.find((d) => d.driverId === oeeDriverId);
      expect(oeeEntry?.driverValue).toBe(88.0);
      expect(oeeEntry?.isOverridden).toBe(true);
    });
  });

  // =========================================================================
  // 4. Unified Plan Input Storage & Immutability Rules
  // =========================================================================
  describe('4. Plan Inputs & Strict Immutability Rules', () => {
    let salesVolInputId: string;

    it('saves plan inputs with dimensional lineage and batch upserts', async () => {
      const result = await batchUpsertPlanInputs(orgId, adminUserId, {
        planningCycleId: cycleId,
        planVersionId: baseVersionId,
        inputs: [
          {
            planningCycleId: cycleId,
            planVersionId: baseVersionId,
            fiscalPeriodId: period1Id,
            plantId,
            productId,
            inputCategory: 'DEMAND',
            inputCode: 'SALES_VOLUME',
            inputValue: 4500,
            unitOfMeasure: 'EA',
            sourceType: 'MANUAL',
          },
          {
            planningCycleId: cycleId,
            planVersionId: baseVersionId,
            fiscalPeriodId: period1Id,
            plantId,
            productId,
            inputCategory: 'DEMAND',
            inputCode: 'UNIT_PRICE',
            inputValue: 520,
            unitOfMeasure: 'USD',
            sourceType: 'ASSUMPTION',
          },
          {
            planningCycleId: cycleId,
            planVersionId: baseVersionId,
            fiscalPeriodId: period1Id,
            plantId,
            productId,
            inputCategory: 'PRODUCTION',
            inputCode: 'PRODUCTION_VOLUME',
            inputValue: 4650,
            unitOfMeasure: 'EA',
            sourceType: 'MANUAL',
          },
          {
            planningCycleId: cycleId,
            planVersionId: baseVersionId,
            fiscalPeriodId: period1Id,
            plantId,
            productId,
            materialId,
            inputCategory: 'MATERIAL',
            inputCode: 'RAW_MATERIAL_QTY',
            inputValue: 4800,
            unitOfMeasure: 'EA',
            sourceType: 'MANUAL',
          },
        ],
      });

      expect(result.count).toBe(4);
      expect(result.inputs.length).toBe(4);
      salesVolInputId = result.inputs.find((i) => i.inputCode === 'SALES_VOLUME')!.id;
    });

    it('enforces override reason on plan inputs marked as overridden', async () => {
      await expect(
        upsertPlanInput(orgId, adminUserId, {
          planningCycleId: cycleId,
          planVersionId: baseVersionId,
          fiscalPeriodId: period1Id,
          plantId,
          productId,
          inputCategory: 'DEMAND',
          inputCode: 'SALES_VOLUME',
          inputValue: 6000,
          unitOfMeasure: 'EA',
          isOverridden: true,
          overrideReason: '',
        })
      ).rejects.toThrow();

      const validOverride = await upsertPlanInput(orgId, adminUserId, {
        planningCycleId: cycleId,
        planVersionId: baseVersionId,
        fiscalPeriodId: period1Id,
        plantId,
        productId,
        inputCategory: 'DEMAND',
        inputCode: 'SALES_VOLUME',
        inputValue: 6000,
        unitOfMeasure: 'EA',
        isOverridden: true,
        overrideReason: 'Special military tender contract award',
      });
      expect(validOverride.inputValue).toBe(6000);
      expect(validOverride.isOverridden).toBe(true);
      expect(validOverride.overrideReason).toBe('Special military tender contract award');
    });

    it('rejects input modification when fiscal period is LOCKED', async () => {
      // Lock period 2
      await updatePeriodStatus(orgId, adminUserId, period2Id, { status: 'LOCKED' });

      await expect(
        upsertPlanInput(orgId, adminUserId, {
          planningCycleId: cycleId,
          planVersionId: baseVersionId,
          fiscalPeriodId: period2Id,
          plantId,
          productId,
          inputCategory: 'DEMAND',
          inputCode: 'SALES_VOLUME',
          inputValue: 7000,
          unitOfMeasure: 'EA',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('rejects input modification and target edits when plan version is APPROVED or LOCKED', async () => {
      // Transition baseVersionId: DRAFT -> IN_REVIEW -> APPROVED
      await updatePlanVersionStatus(orgId, adminUserId, baseVersionId, { status: 'IN_REVIEW' });
      await updatePlanVersionStatus(orgId, adminUserId, baseVersionId, { status: 'APPROVED' });

      // Attempting to modify plan input on approved version must fail
      await expect(
        upsertPlanInput(orgId, adminUserId, {
          planningCycleId: cycleId,
          planVersionId: baseVersionId,
          fiscalPeriodId: period1Id,
          plantId,
          productId,
          inputCategory: 'DEMAND',
          inputCode: 'SALES_VOLUME',
          inputValue: 7500,
          unitOfMeasure: 'EA',
        })
      ).rejects.toThrow(ValidationError);

      // Attempting to add target on approved version must fail
      await expect(
        createTarget(orgId, adminUserId, {
          planningCycleId: cycleId,
          planVersionId: baseVersionId,
          fiscalPeriodId: period1Id,
          targetMetric: 'HEADCOUNT',
          targetValue: 120,
          unitOfMeasure: 'FTE',
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  // =========================================================================
  // 5. Version Copying Across Planning Artifacts
  // =========================================================================
  describe('5. Transactional Version Copying', () => {
    it('copies planning targets, assumptions, drivers, and inputs from approved base to draft version', async () => {
      const copyResult = await copyVersionData(orgId, adminUserId, {
        sourceVersionId: baseVersionId,
        targetVersionId: draftVersionId,
        categories: ['TARGETS', 'ASSUMPTIONS', 'DRIVERS', 'INPUTS'],
        overwritePolicy: 'OVERWRITE',
      });

      expect(copyResult.counts.targetsCopied).toBeGreaterThan(0);
      expect(copyResult.counts.assumptionsCopied).toBeGreaterThan(0);
      expect(copyResult.counts.inputsCopied).toBeGreaterThan(0);

      // Verify copied inputs exist in draft version
      const inputsInDraft = await getPlanInputs(orgId, {
        planVersionId: draftVersionId,
      });
      expect(inputsInDraft.length).toBe(4);
    });

    it('rejects copy destination if target version is APPROVED or LOCKED', async () => {
      // Attempting to copy into baseVersionId (which is APPROVED) must fail
      await expect(
        copyVersionData(orgId, adminUserId, {
          sourceVersionId: draftVersionId,
          targetVersionId: baseVersionId,
          categories: ['INPUTS'],
          overwritePolicy: 'OVERWRITE',
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  // =========================================================================
  // 6. Side-by-Side Version Comparison Delta Analysis
  // =========================================================================
  describe('6. Side-by-Side Version Comparison Delta Analysis', () => {
    it('computes comparison deltas and identifies CHANGED, UNCHANGED, ADDED items', async () => {
      // In draftVersionId, let's modify SALES_VOLUME from 6000 to 7200 (+20%)
      await upsertPlanInput(orgId, adminUserId, {
        planningCycleId: cycleId,
        planVersionId: draftVersionId,
        fiscalPeriodId: period1Id,
        plantId,
        productId,
        inputCategory: 'DEMAND',
        inputCode: 'SALES_VOLUME',
        inputValue: 7200,
        unitOfMeasure: 'EA',
        isOverridden: true,
        overrideReason: 'Aggressive marketing campaign expansion',
      });

      // Also add a new input in draft: OVERHEAD -> UTILITIES_AMOUNT = 15000
      await upsertPlanInput(orgId, adminUserId, {
        planningCycleId: cycleId,
        planVersionId: draftVersionId,
        fiscalPeriodId: period1Id,
        plantId,
        inputCategory: 'OVERHEAD',
        inputCode: 'UTILITIES_AMOUNT',
        inputValue: 15000,
        unitOfMeasure: 'USD',
        sourceType: 'MANUAL',
      });

      const comparison = await compareVersions(orgId, baseVersionId, draftVersionId);

      expect(comparison.summary.totalRecords).toBeGreaterThanOrEqual(4);
      expect(comparison.summary.totalChanged).toBeGreaterThanOrEqual(1);
      expect(comparison.summary.totalAdded).toBeGreaterThanOrEqual(1);

      // Check SALES_VOLUME delta
      const salesDiff = comparison.diffs.find((r) => r.metricOrCode === 'SALES_VOLUME');
      expect(salesDiff).toBeDefined();
      expect(salesDiff?.sourceValue).toBe(6000);
      expect(salesDiff?.targetValue).toBe(7200);
      expect(salesDiff?.delta).toBe(1200);
      expect(salesDiff?.changeType).toBe('CHANGED');

      // Check UTILITIES_AMOUNT delta (ADDED)
      const utilDiff = comparison.diffs.find((r) => r.metricOrCode === 'UTILITIES_AMOUNT');
      expect(utilDiff).toBeDefined();
      expect(utilDiff?.sourceValue).toBeNull();
      expect(utilDiff?.targetValue).toBe(15000);
      expect(utilDiff?.changeType).toBe('ADDED');
    });
  });

  // =========================================================================
  // 7. Multi-Tenant Organization Isolation
  // =========================================================================
  describe('7. Multi-Tenant Isolation', () => {
    it('prevents other organization from viewing or copying inputs across tenant boundaries', async () => {
      // 1. Other org cannot fetch inputs belonging to orgId
      const inputs = await getPlanInputs(otherOrgId, {
        planVersionId: baseVersionId,
      });
      expect(inputs.length).toBe(0);

      // 2. Other org cannot fetch drivers belonging to orgId
      const drivers = await getDrivers(otherOrgId);
      expect(drivers.length).toBe(0);

      // 3. Other org cannot perform version copy on orgId versions
      await expect(
        copyVersionData(otherOrgId, otherUserId, {
          sourceVersionId: baseVersionId,
          targetVersionId: draftVersionId,
          categories: ['INPUTS'],
          overwritePolicy: 'SKIP',
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  // =========================================================================
  // 8. Complete 10-Step End-to-End Planning Workflow (Section 13)
  // =========================================================================
  describe('8. 10-Step End-to-End Planning Flow', () => {
    it('executes full 10-step lifecycle cleanly and deterministically', async () => {
      // Step 1: Create Planning Cycle & Base Plan Version
      const e2eCycle = await createPlanningCycle(orgId, adminUserId, {
        name: 'E2E FY2026 Budget Cycle',
        planningType: 'ANNUAL_BUDGET',
        fiscalYear: 2026,
        startPeriodId: period1Id,
        endPeriodId: period2Id,
      });

      const e2eBase = await createPlanVersion(orgId, adminUserId, e2eCycle.id, {
        versionCode: 'V1-E2E-BASE',
        versionName: 'E2E Base Operating Plan',
        versionType: 'BASE_CASE',
      });

      // Step 2: Set Management Targets (Revenue, Units, Margin %)
      await createTarget(orgId, adminUserId, {
        planningCycleId: e2eCycle.id,
        planVersionId: e2eBase.id,
        fiscalPeriodId: period1Id,
        targetMetric: 'REVENUE',
        targetValue: 2000000,
        unitOfMeasure: 'USD',
      });
      await createTarget(orgId, adminUserId, {
        planningCycleId: e2eCycle.id,
        planVersionId: e2eBase.id,
        fiscalPeriodId: period1Id,
        plantId,
        productId,
        targetMetric: 'SALES_QUANTITY',
        targetValue: 3500,
        unitOfMeasure: 'EA',
      });
      await createTarget(orgId, adminUserId, {
        planningCycleId: e2eCycle.id,
        planVersionId: e2eBase.id,
        fiscalPeriodId: period1Id,
        targetMetric: 'GROSS_MARGIN_PERCENT',
        targetValue: 45.0,
        unitOfMeasure: 'PERCENT',
      });

      // Step 3: Define Macro Assumptions (Inflation, Price)
      await createAssumption(orgId, adminUserId, {
        planningCycleId: e2eCycle.id,
        planVersionId: e2eBase.id,
        code: 'E2E_INFLATION',
        name: 'E2E Annual Inflation',
        category: 'OTHER',
        valueType: 'PERCENTAGE',
        numericValue: 3.5,
        unit: '%',
      });
      await createAssumption(orgId, adminUserId, {
        planningCycleId: e2eCycle.id,
        planVersionId: e2eBase.id,
        code: 'E2E_LIST_PRICE',
        name: 'E2E Catalog Unit Price',
        category: 'PRICING',
        valueType: 'CURRENCY',
        numericValue: 550.0,
        unit: 'USD',
        productId,
      });

      // Step 4: Define Operational Drivers (Scrap Rate, Machine Efficiency)
      const e2eScrapDriver = await createDriver(orgId, adminUserId, {
        driverCode: 'DRV-E2E-SCRAP',
        driverName: 'E2E Casting Scrap',
        driverCategory: 'PRODUCTION',
        driverType: 'PERCENTAGE',
        unitOfMeasure: '%',
        defaultValue: 2.2,
      });

      // Step 5: Enter Demand Plan Inputs (Units, Price)
      await batchUpsertPlanInputs(orgId, adminUserId, {
        planningCycleId: e2eCycle.id,
        planVersionId: e2eBase.id,
        inputs: [
          {
            planningCycleId: e2eCycle.id,
            planVersionId: e2eBase.id,
            fiscalPeriodId: period1Id,
            plantId,
            productId,
            inputCategory: 'DEMAND',
            inputCode: 'SALES_VOLUME',
            inputValue: 3500,
            unitOfMeasure: 'EA',
            sourceType: 'MANUAL',
          },
          {
            planningCycleId: e2eCycle.id,
            planVersionId: e2eBase.id,
            fiscalPeriodId: period1Id,
            plantId,
            productId,
            inputCategory: 'DEMAND',
            inputCode: 'UNIT_PRICE',
            inputValue: 550,
            unitOfMeasure: 'USD',
            sourceType: 'ASSUMPTION',
          },
        ],
      });

      // Step 6: Generate / Enter Production Plan Inputs
      await upsertPlanInput(orgId, adminUserId, {
        planningCycleId: e2eCycle.id,
        planVersionId: e2eBase.id,
        fiscalPeriodId: period1Id,
        plantId,
        productId,
        inputCategory: 'PRODUCTION',
        inputCode: 'PRODUCTION_VOLUME',
        inputValue: 3600,
        unitOfMeasure: 'EA',
        sourceType: 'MANUAL',
      });

      // Step 7: Enter Material, Labor, and Overhead Inputs
      await batchUpsertPlanInputs(orgId, adminUserId, {
        planningCycleId: e2eCycle.id,
        planVersionId: e2eBase.id,
        inputs: [
          {
            planningCycleId: e2eCycle.id,
            planVersionId: e2eBase.id,
            fiscalPeriodId: period1Id,
            plantId,
            productId,
            materialId,
            inputCategory: 'MATERIAL',
            inputCode: 'RAW_MATERIAL_QTY',
            inputValue: 3700,
            unitOfMeasure: 'EA',
          },
          {
            planningCycleId: e2eCycle.id,
            planVersionId: e2eBase.id,
            fiscalPeriodId: period1Id,
            plantId,
            inputCategory: 'LABOR',
            inputCode: 'ASSEMBLY_LABOR_HOURS',
            inputValue: 450,
            unitOfMeasure: 'HOURS',
          },
          {
            planningCycleId: e2eCycle.id,
            planVersionId: e2eBase.id,
            fiscalPeriodId: period1Id,
            plantId,
            inputCategory: 'OVERHEAD',
            inputCode: 'FIXED_OVERHEAD_ALLOC',
            inputValue: 35000,
            unitOfMeasure: 'USD',
          },
        ],
      });

      // Step 8: Create Scenario Version (Upside) & Copy Data
      const e2eScenario = await createPlanVersion(orgId, adminUserId, e2eCycle.id, {
        versionCode: 'V2-E2E-UPSIDE',
        versionName: 'E2E Upside Scenario (+15%)',
        versionType: 'BEST_CASE',
      });

      const copyReport = await copyVersionData(orgId, adminUserId, {
        sourceVersionId: e2eBase.id,
        targetVersionId: e2eScenario.id,
        categories: ['TARGETS', 'ASSUMPTIONS', 'DRIVERS', 'INPUTS'],
        overwritePolicy: 'OVERWRITE',
      });
      expect(copyReport.counts.inputsCopied).toBeGreaterThan(0);

      // Step 9: Apply Driver & Input Overrides in Scenario Version
      await setPlanDriverValue(orgId, adminUserId, {
        planVersionId: e2eScenario.id,
        driverId: e2eScrapDriver.id,
        driverValue: 1.5,
        isOverridden: true,
        overrideReason: 'Supplier precision defect reduction program',
      });

      await upsertPlanInput(orgId, adminUserId, {
        planningCycleId: e2eCycle.id,
        planVersionId: e2eScenario.id,
        fiscalPeriodId: period1Id,
        plantId,
        productId,
        inputCategory: 'DEMAND',
        inputCode: 'SALES_VOLUME',
        inputValue: 4025, // +15%
        unitOfMeasure: 'EA',
        isOverridden: true,
        overrideReason: 'Expansion into aerospace customer tier',
      });

      // Step 10: Run Side-by-Side Version Comparison Delta Report
      const comparisonReport = await compareVersions(orgId, e2eBase.id, e2eScenario.id);

      expect(comparisonReport.summary.sourceVersion.code).toBe('V1-E2E-BASE');
      expect(comparisonReport.summary.targetVersion.code).toBe('V2-E2E-UPSIDE');
      const salesDiff = comparisonReport.diffs.find((r) => r.metricOrCode === 'SALES_VOLUME');
      expect(salesDiff?.sourceValue).toBe(3500);
      expect(salesDiff?.targetValue).toBe(4025);
      expect(salesDiff?.delta).toBe(525);
      expect(salesDiff?.changeType).toBe('CHANGED');
    });
  });
});
