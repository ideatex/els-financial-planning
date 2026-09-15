import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '@/lib/db';
import { registerUser } from '@/server/services/auth.service';
import { createPlant, getPlants, getPlantById } from '@/server/services/plant.service';
import { createProduct, getProducts, getProductById } from '@/server/services/product.service';
import { createMaterial, getMaterials, getMaterialById } from '@/server/services/material.service';
import {
  createBomHeader,
  createBomVersion,
  addBomLine,
  updateBomVersionStatus,
  getBomById,
} from '@/server/services/bom.service';
import {
  createRoutingHeader,
  createRoutingVersion,
  addRoutingOperation,
  updateRoutingVersionStatus,
  getRoutingById,
} from '@/server/services/routing.service';
import {
  createAccount,
  getAccountTree,
  getAccountById,
  deleteAccount,
} from '@/server/services/coa.service';
import {
  createFiscalCalendar,
  updatePeriodStatus,
  generateAdditionalFiscalYear,
} from '@/server/services/calendar.service';
import {
  createPlanningCycle,
  updatePlanningCycleStatus,
  getPlanningCycleById,
} from '@/server/services/planning-cycle.service';
import {
  createPlanVersion,
  updatePlanVersion,
  updatePlanVersionStatus,
  duplicatePlanVersion,
  getPlanVersionById,
} from '@/server/services/plan-version.service';
import { ConflictError, ValidationError } from '@/core/errors/AppError';

describe('Phase 2 Master Data & Planning Foundations Integration', () => {
  let orgId: string;
  let adminUserId: string;

  beforeAll(async () => {
    // Register test admin user & organization
    const email = `phase2-admin-${Date.now()}@test.com`;
    const reg = await registerUser({
      email,
      password: 'Password123!',
      name: 'Phase 2 Admin',
      organizationName: `Phase 2 Test Corp ${Date.now()}`,
    });

    adminUserId = reg.user.id;
    orgId = reg.organization.id;
  });

  describe('1. Plant Management', () => {
    it('creates and isolates manufacturing plants per organization', async () => {
      const plant = await createPlant(orgId, adminUserId, {
        code: 'TEST-PLANT-01',
        name: 'Cleveland Test Assembly Plant',
        city: 'Cleveland',
        state: 'OH',
        country: 'USA',
        timeZone: 'America/New_York',
        baseCurrency: 'USD',
        isActive: true,
      });

      expect(plant.id).toBeDefined();
      expect(plant.code).toBe('TEST-PLANT-01');
      expect(plant.organizationId).toBe(orgId);

      const list = await getPlants(orgId);
      expect(list.some((p) => p.code === 'TEST-PLANT-01')).toBe(true);

      const fetched = await getPlantById(orgId, plant.id);
      expect(fetched.name).toBe('Cleveland Test Assembly Plant');
    });

    it('enforces unique plant codes per organization', async () => {
      await expect(
        createPlant(orgId, adminUserId, {
          code: 'TEST-PLANT-01',
          name: 'Duplicate Plant Code',
          country: 'USA',
          timeZone: 'America/New_York',
          baseCurrency: 'USD',
          isActive: true,
        })
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('2. Product Master', () => {
    let plantId: string;

    beforeAll(async () => {
      const plants = await getPlants(orgId);
      plantId = plants[0].id;
    });

    it('creates finished goods with deterministic integer cents standard price', async () => {
      const product = await createProduct(orgId, adminUserId, {
        code: 'FG-VALVE-500',
        name: 'High Pressure Control Valve 500 PSI',
        category: 'Valves',
        productType: 'FINISHED_GOOD',
        unitOfMeasure: 'EA',
        defaultPlantId: plantId,
        standardPriceCents: 125000, // $1,250.00
        currency: 'USD',
        isActive: true,
      });

      expect(product.id).toBeDefined();
      expect(product.standardPriceCents).toBe(125000);
      expect(Number.isInteger(product.standardPriceCents)).toBe(true);

      const fetched = await getProductById(orgId, product.id);
      expect(fetched.code).toBe('FG-VALVE-500');
      expect(fetched.defaultPlant?.id).toBe(plantId);
    });

    it('creates subassembly products for multi-level BOM structures', async () => {
      const subassembly = await createProduct(orgId, adminUserId, {
        code: 'SA-ACTUATOR-01',
        name: 'Pneumatic Actuator Subassembly',
        category: 'Subassemblies',
        productType: 'SEMI_FINISHED_GOOD',
        unitOfMeasure: 'EA',
        standardPriceCents: 45000, // $450.00
        currency: 'USD',
        isActive: true,
      });

      expect(subassembly.productType).toBe('SEMI_FINISHED_GOOD');
    });
  });

  describe('3. Material Master', () => {
    it('creates raw materials with lead times and standard costs', async () => {
      const material = await createMaterial(orgId, adminUserId, {
        code: 'RM-CASTING-01',
        name: 'Cast Iron Housing Body',
        category: 'Castings',
        unitOfMeasure: 'EA',
        defaultCostCents: 8500, // $85.00
        currency: 'USD',
        leadTimeDays: 21,
        supplierReference: 'SUP-CAST-99',
        isActive: true,
      });

      expect(material.id).toBeDefined();
      expect(material.defaultCostCents).toBe(8500);
      expect(material.leadTimeDays).toBe(21);

      const fetched = await getMaterialById(orgId, material.id);
      expect(fetched.name).toBe('Cast Iron Housing Body');
    });
  });

  describe('4. Bills of Materials (BOM) & Circular Reference Traversal', () => {
    let finishedGoodId: string;
    let subassemblyId: string;
    let materialId: string;

    beforeAll(async () => {
      const products = await getProducts(orgId);
      const fg = products.find((p) => p.productType === 'FINISHED_GOOD')!;
      const sa = products.find((p) => p.productType === 'SEMI_FINISHED_GOOD')!;
      const materials = await getMaterials(orgId);

      finishedGoodId = fg.id;
      subassemblyId = sa.id;
      materialId = materials[0].id;
    });

    it('creates a BOM header, version, and line items with scrap rates', async () => {
      const bomHeader = await createBomHeader(orgId, adminUserId, {
        productId: finishedGoodId,
        name: 'Standard Control Valve BOM',
        description: 'Standard production configuration',
        isActive: true,
      });

      expect(bomHeader.id).toBeDefined();
      expect(bomHeader.productId).toBe(finishedGoodId);

      // Version 1 is created automatically with header
      const fetchedBom = await getBomById(orgId, bomHeader.id);
      const v1 = fetchedBom.versions[0];
      expect(v1).toBeDefined();
      expect(v1.status).toBe('DRAFT');

      // Add raw material component line with 3% scrap
      const line1 = await addBomLine(orgId, adminUserId, v1.id, {
        componentType: 'MATERIAL',
        materialId,
        quantityPerUnit: 1,
        unitOfMeasure: 'EA',
        scrapPercentage: 3.0,
      });
      expect(line1.scrapPercentage).toBe(3.0);

      // Add subassembly component line
      const line2 = await addBomLine(orgId, adminUserId, v1.id, {
        componentType: 'PRODUCT',
        componentProductId: subassemblyId,
        quantityPerUnit: 1,
        unitOfMeasure: 'EA',
        scrapPercentage: 0.0,
      });
      expect(line2.componentProductId).toBe(subassemblyId);

      // Transition to APPROVED
      const approved = await updateBomVersionStatus(orgId, adminUserId, v1.id, 'APPROVED');
      expect(approved.status).toBe('APPROVED');

      // Verify cannot add lines to an approved BOM
      await expect(
        addBomLine(orgId, adminUserId, v1.id, {
          componentType: 'MATERIAL',
          materialId,
          quantityPerUnit: 2,
          unitOfMeasure: 'EA',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('detects and rejects circular BOM references (A cannot contain A transitively)', async () => {
      // Subassembly BOM
      const saBom = await createBomHeader(orgId, adminUserId, {
        productId: subassemblyId,
        name: 'Subassembly BOM',
        isActive: true,
      });

      const fetchedSaBom = await getBomById(orgId, saBom.id);
      const saV1 = fetchedSaBom.versions[0];

      // Attempt to include Finished Good inside the Subassembly BOM when Finished Good already contains Subassembly!
      await expect(
        addBomLine(orgId, adminUserId, saV1.id, {
          componentType: 'PRODUCT',
          componentProductId: finishedGoodId,
          quantityPerUnit: 1,
          unitOfMeasure: 'EA',
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('5. Routings & Operations', () => {
    let productId: string;
    let plantId: string;

    beforeAll(async () => {
      const products = await getProducts(orgId);
      const plants = await getPlants(orgId);
      productId = products[0].id;
      plantId = plants[0].id;
    });

    it('creates routing header, versions, and sequential operations with cycle metrics', async () => {
      const routingHeader = await createRoutingHeader(orgId, adminUserId, {
        productId,
        plantId,
        name: 'Valve Production Routing',
        description: 'Standard 2-stage machining and assembly',
        isActive: true,
      });

      expect(routingHeader.id).toBeDefined();

      const fetchedRouting = await getRoutingById(orgId, routingHeader.id);
      const v1 = fetchedRouting.versions[0];
      expect(v1).toBeDefined();

      // Sequence 10: Machining
      const op10 = await addRoutingOperation(orgId, adminUserId, v1.id, {
        sequence: 10,
        operationName: 'Precision CNC Turning',
        workCenter: 'WC-CNC-01',
        setupTimeMinutes: 30,
        runTimePerUnitMinutes: 5.5,
        laborHoursPerUnit: 0.2,
        machineHoursPerUnit: 0.091,
      });
      expect(op10.sequence).toBe(10);

      // Sequence 20: Assembly & Pressure Testing
      const op20 = await addRoutingOperation(orgId, adminUserId, v1.id, {
        sequence: 20,
        operationName: 'Assembly & Hydrostatic Test',
        workCenter: 'WC-TEST-01',
        setupTimeMinutes: 10,
        runTimePerUnitMinutes: 8.0,
        laborHoursPerUnit: 0.35,
        machineHoursPerUnit: 0.133,
      });
      expect(op20.sequence).toBe(20);

      const approved = await updateRoutingVersionStatus(orgId, adminUserId, v1.id, 'APPROVED');
      expect(approved.status).toBe('APPROVED');

      // Attempting to add an operation to approved routing throws ValidationError
      await expect(
        addRoutingOperation(orgId, adminUserId, v1.id, {
          sequence: 30,
          operationName: 'Packing',
          workCenter: 'WC-PACK',
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('6. Chart of Accounts Hierarchy', () => {
    it('creates parent and child accounts and validates tree structure', async () => {
      // Create top-level parent COGS account
      const parentAcc = await createAccount(orgId, adminUserId, {
        code: '5000',
        name: 'Cost of Goods Sold',
        accountType: 'COGS',
        normalBalance: 'DEBIT',
        currency: 'USD',
        isActive: true,
      });

      // Create child direct material account
      const childAcc = await createAccount(orgId, adminUserId, {
        code: '5010',
        name: 'Direct Materials Expense',
        accountType: 'COGS',
        parentAccountId: parentAcc.id,
        normalBalance: 'DEBIT',
        currency: 'USD',
        isActive: true,
      });

      expect(childAcc.parentAccountId).toBe(parentAcc.id);

      // Tree structure verification
      const tree = await getAccountTree(orgId);
      const rootInTree = tree.find((a) => a.id === parentAcc.id);
      expect(rootInTree).toBeDefined();
      expect(rootInTree?.childAccounts?.some((c) => c.id === childAcc.id)).toBe(true);
    });

    it('safeguards against deleting parent accounts with active children', async () => {
      const parent = await db.account.findFirst({
        where: { organizationId: orgId, code: '5000' },
      });
      expect(parent).toBeDefined();

      await expect(deleteAccount(orgId, adminUserId, parent!.id)).rejects.toThrow(ValidationError);
    });
  });

  describe('7. Fiscal Calendar & Period Generation', () => {
    it('generates 12 sequential monthly periods with quarter calculations', async () => {
      const calendar = await createFiscalCalendar(orgId, adminUserId, {
        name: 'FY2026 Fiscal Calendar',
        fiscalYearStartMonth: 10, // October start
        startYear: 2026,
        calendarType: 'MONTHLY',
      });

      expect(calendar.id).toBeDefined();
      expect(calendar.periods).toHaveLength(12);

      // Period 1 must be October (Q1)
      const p1 = calendar.periods.find((p) => p.periodNumber === 1)!;
      expect(p1.periodName).toContain('Oct');
      expect(p1.quarter).toBe(1);
      expect(p1.status).toBe('OPEN');

      // Period 12 must be September (Q4)
      const p12 = calendar.periods.find((p) => p.periodNumber === 12)!;
      expect(p12.periodName).toContain('Sep');
      expect(p12.quarter).toBe(4);
    });

    it('closes and locks fiscal periods enforcing immutability', async () => {
      const calendar = await db.fiscalCalendar.findFirst({
        where: { organizationId: orgId },
        include: { periods: true },
      });
      const p1 = calendar!.periods[0];

      // Close period
      const closed = await updatePeriodStatus(orgId, adminUserId, p1.id, { status: 'CLOSED' });
      expect(closed.status).toBe('CLOSED');
      expect(closed.closedDate).not.toBeNull();

      // Lock period
      const locked = await updatePeriodStatus(orgId, adminUserId, p1.id, { status: 'LOCKED' });
      expect(locked.status).toBe('LOCKED');

      // Cannot reopen directly without administrative unlock
      await expect(
        updatePeriodStatus(orgId, adminUserId, p1.id, { status: 'OPEN' })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('8. Planning Cycle & Plan Version Governance', () => {
    let cycleId: string;
    let baseVersionId: string;

    it('creates planning cycle and initial baseline plan version', async () => {
      const cycle = await createPlanningCycle(orgId, adminUserId, {
        name: 'FY2026 Annual Operating Budget',
        planningType: 'ANNUAL_BUDGET',
        fiscalYear: 2026,
        description: 'Approved manufacturing budget cycle',
      });

      expect(cycle.id).toBeDefined();
      expect(cycle.status).toBe('DRAFT');
      cycleId = cycle.id;

      // Transition cycle to OPEN
      await updatePlanningCycleStatus(orgId, adminUserId, cycle.id, { status: 'OPEN' });

      // Create base version
      const v1 = await createPlanVersion(orgId, adminUserId, cycle.id, {
        versionCode: 'V1-BASE',
        versionName: 'Baseline Operating Plan',
        versionType: 'BASE_CASE',
        scenarioLabel: 'Expected',
      });

      expect(v1.id).toBeDefined();
      expect(v1.status).toBe('DRAFT');
      baseVersionId = v1.id;
    });

    it('progresses plan version through review and approval lifecycle', async () => {
      // Submit for review
      const submitted = await updatePlanVersionStatus(orgId, adminUserId, baseVersionId, {
        status: 'IN_REVIEW',
      });
      expect(submitted.status).toBe('IN_REVIEW');
      expect(submitted.submittedDate).not.toBeNull();

      // Approve version
      const approved = await updatePlanVersionStatus(orgId, adminUserId, baseVersionId, {
        status: 'APPROVED',
      });
      expect(approved.status).toBe('APPROVED');
      expect(approved.approvedDate).not.toBeNull();

      // STRICT IMMUTABILITY: Cannot edit approved plan version directly
      await expect(
        updatePlanVersion(orgId, adminUserId, baseVersionId, {
          versionName: 'Modified After Approval',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('branches/duplicates approved baseline into a new working scenario', async () => {
      const branch = await duplicatePlanVersion(orgId, adminUserId, baseVersionId, {
        newVersionCode: 'V1-UPSIDE',
        newVersionName: 'Upside Demand Scenario (+15%)',
        scenarioLabel: 'Upside +15%',
      });

      expect(branch.id).toBeDefined();
      expect(branch.versionCode).toBe('V1-UPSIDE');
      expect(branch.baseVersionId).toBe(baseVersionId);
      expect(branch.status).toBe('DRAFT');

      // The branched version is in DRAFT and CAN be modified
      const updatedBranch = await updatePlanVersion(orgId, adminUserId, branch.id, {
        description: 'Incorporates expansion in Midwest sales territory',
      });
      expect(updatedBranch.description).toContain('Midwest sales territory');
    });

    it('supports review rejection with a required rejection note', async () => {
      // Create a test version to reject
      const testVer = await createPlanVersion(orgId, adminUserId, cycleId, {
        versionCode: 'V1-TEST-REJECT',
        versionName: 'Test Draft To Reject',
        versionType: 'MANAGEMENT_SCENARIO',
      });

      await updatePlanVersionStatus(orgId, adminUserId, testVer.id, { status: 'IN_REVIEW' });

      // Reject with note
      const rejected = await updatePlanVersionStatus(orgId, adminUserId, testVer.id, {
        status: 'REJECTED',
        rejectionReason: 'BOM labor hours for turning operation sequence 10 are non-compliant',
      });

      expect(rejected.status).toBe('REJECTED');
      expect(rejected.rejectionReason).toContain('turning operation sequence 10');
    });

    it('locks approved versions for permanent financial audit immutability', async () => {
      const locked = await updatePlanVersionStatus(orgId, adminUserId, baseVersionId, {
        status: 'LOCKED',
      });
      expect(locked.status).toBe('LOCKED');
      expect(locked.lockedDate).not.toBeNull();
    });
  });
});
