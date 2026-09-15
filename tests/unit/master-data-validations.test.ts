import { describe, it, expect } from 'vitest';
import {
  createPlantSchema,
  createProductSchema,
  createMaterialSchema,
  addBomLineSchema,
  addRoutingOperationSchema,
  createAccountSchema,
  createFiscalCalendarSchema,
} from '@/lib/validations/master-data';
import {
  createPlanningCycleSchema,
  createPlanVersionSchema,
  updatePlanVersionStatusSchema,
  duplicatePlanVersionSchema,
} from '@/lib/validations/planning';

describe('Phase 2 Master Data Validations (Unit)', () => {
  describe('Plant Validation', () => {
    it('validates a correct plant payload', () => {
      const result = createPlantSchema.safeParse({
        code: 'det-01',
        name: 'Detroit Facility',
        country: 'USA',
        timeZone: 'America/Detroit',
        baseCurrency: 'USD',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.code).toBe('DET-01');
      }
    });

    it('rejects invalid plant codes with special characters', () => {
      const result = createPlantSchema.safeParse({
        code: 'DET#01!',
        name: 'Detroit Facility',
      });
      expect(result.success).toBe(false);
    });

    it('rejects currency codes not having 3 letters', () => {
      const result = createPlantSchema.safeParse({
        code: 'PLANT-1',
        name: 'Detroit Facility',
        baseCurrency: 'USDD',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Product Master Validation', () => {
    it('validates product with integer standard price cents', () => {
      const result = createProductSchema.safeParse({
        code: 'fg-widget-01',
        name: 'Precision Widget A',
        category: 'Machining',
        productType: 'FINISHED_GOOD',
        unitOfMeasure: 'EA',
        standardPriceCents: 15000,
        currency: 'USD',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.code).toBe('FG-WIDGET-01');
        expect(result.data.standardPriceCents).toBe(15000);
      }
    });

    it('rejects floating-point or negative prices', () => {
      const resultFloat = createProductSchema.safeParse({
        code: 'FG-WIDGET-01',
        name: 'Precision Widget A',
        category: 'Machining',
        productType: 'FINISHED_GOOD',
        unitOfMeasure: 'EA',
        standardPriceCents: 150.5,
      });
      expect(resultFloat.success).toBe(false);

      const resultNeg = createProductSchema.safeParse({
        code: 'FG-WIDGET-01',
        name: 'Precision Widget A',
        category: 'Machining',
        productType: 'FINISHED_GOOD',
        unitOfMeasure: 'EA',
        standardPriceCents: -500,
      });
      expect(resultNeg.success).toBe(false);
    });

    it('enforces effective date ordering', () => {
      const result = createProductSchema.safeParse({
        code: 'FG-DATE',
        name: 'Widget with Dates',
        category: 'Machining',
        productType: 'FINISHED_GOOD',
        unitOfMeasure: 'EA',
        standardPriceCents: 1000,
        effectiveFrom: '2026-12-31T00:00:00.000Z',
        effectiveTo: '2026-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Material Master Validation', () => {
    it('validates material with lead times and default cost in cents', () => {
      const result = createMaterialSchema.safeParse({
        code: 'rm-steel-01',
        name: 'Cold-Rolled Steel Sheet',
        category: 'Metals',
        unitOfMeasure: 'KG',
        defaultCostCents: 450,
        currency: 'USD',
        leadTimeDays: 14,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.code).toBe('RM-STEEL-01');
        expect(result.data.defaultCostCents).toBe(450);
        expect(result.data.leadTimeDays).toBe(14);
      }
    });

    it('rejects negative lead times', () => {
      const result = createMaterialSchema.safeParse({
        code: 'RM-STEEL-01',
        name: 'Cold-Rolled Steel Sheet',
        category: 'Metals',
        unitOfMeasure: 'KG',
        defaultCostCents: 450,
        leadTimeDays: -5,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Bill of Materials (BOM) Validation', () => {
    it('validates raw material BOM line', () => {
      const result = addBomLineSchema.safeParse({
        componentType: 'MATERIAL',
        materialId: 'mat-123',
        quantityPerUnit: 2.5,
        unitOfMeasure: 'KG',
        scrapPercentage: 5,
      });
      expect(result.success).toBe(true);
    });

    it('validates subassembly product BOM line', () => {
      const result = addBomLineSchema.safeParse({
        componentType: 'PRODUCT',
        componentProductId: 'prod-456',
        quantityPerUnit: 1,
        unitOfMeasure: 'EA',
        scrapPercentage: 0,
      });
      expect(result.success).toBe(true);
    });

    it('rejects component type MATERIAL without materialId', () => {
      const result = addBomLineSchema.safeParse({
        componentType: 'MATERIAL',
        componentProductId: 'prod-456',
        quantityPerUnit: 1,
        unitOfMeasure: 'EA',
      });
      expect(result.success).toBe(false);
    });

    it('rejects non-positive quantities or invalid scrap percentage', () => {
      const zeroQty = addBomLineSchema.safeParse({
        componentType: 'MATERIAL',
        materialId: 'mat-123',
        quantityPerUnit: 0,
        unitOfMeasure: 'KG',
      });
      expect(zeroQty.success).toBe(false);

      const invalidScrap = addBomLineSchema.safeParse({
        componentType: 'MATERIAL',
        materialId: 'mat-123',
        quantityPerUnit: 1,
        unitOfMeasure: 'KG',
        scrapPercentage: 150,
      });
      expect(invalidScrap.success).toBe(false);
    });
  });

  describe('Routing & Operations Validation', () => {
    it('validates sequential routing operation with labor and machine times', () => {
      const result = addRoutingOperationSchema.safeParse({
        sequence: 10,
        operationName: 'CNC Milling',
        workCenter: 'WC-MILL-01',
        setupTimeMinutes: 20,
        runTimePerUnitMinutes: 4.5,
        laborHoursPerUnit: 0.15,
        machineHoursPerUnit: 0.075,
      });
      expect(result.success).toBe(true);
    });

    it('rejects negative cycle times or negative sequence', () => {
      const negSeq = addRoutingOperationSchema.safeParse({
        sequence: -10,
        operationName: 'CNC Milling',
        workCenter: 'WC-MILL-01',
      });
      expect(negSeq.success).toBe(false);

      const negLabor = addRoutingOperationSchema.safeParse({
        sequence: 10,
        operationName: 'CNC Milling',
        workCenter: 'WC-MILL-01',
        laborHoursPerUnit: -1,
      });
      expect(negLabor.success).toBe(false);
    });
  });

  describe('Chart of Accounts Validation', () => {
    it('validates account code and classification', () => {
      const result = createAccountSchema.safeParse({
        code: '5010',
        name: 'Direct Materials Expense',
        accountType: 'COGS',
        normalBalance: 'DEBIT',
        currency: 'USD',
      });
      expect(result.success).toBe(true);
    });

    it('rejects unclassified account types', () => {
      const result = createAccountSchema.safeParse({
        code: '9999',
        name: 'Suspense Account',
        accountType: 'UNKNOWN_TYPE',
        normalBalance: 'DEBIT',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Fiscal Calendar Validation', () => {
    it('validates start month between 1 and 12', () => {
      const valid = createFiscalCalendarSchema.safeParse({
        name: 'Standard Jan Calendar',
        fiscalYearStartMonth: 1,
        startYear: 2026,
      });
      expect(valid.success).toBe(true);

      const invalidMonth = createFiscalCalendarSchema.safeParse({
        name: 'Invalid Month Calendar',
        fiscalYearStartMonth: 13,
        startYear: 2026,
      });
      expect(invalidMonth.success).toBe(false);
    });
  });

  describe('Planning Cycle & Version Governance Validation', () => {
    it('validates planning cycle parameters', () => {
      const result = createPlanningCycleSchema.safeParse({
        name: 'FY2026 Operating Plan',
        planningType: 'ANNUAL_BUDGET',
        fiscalYear: 2026,
      });
      expect(result.success).toBe(true);
    });

    it('validates plan version creation', () => {
      const result = createPlanVersionSchema.safeParse({
        versionCode: 'v1-base',
        versionName: 'Baseline Operating Plan',
        versionType: 'BASE_CASE',
        scenarioLabel: 'Expected',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.versionCode).toBe('V1-BASE');
      }
    });

    it('requires a rejection reason when transitioning status to REJECTED', () => {
      const rejectWithReason = updatePlanVersionStatusSchema.safeParse({
        status: 'REJECTED',
        rejectionReason: 'Standard labor run time in operation 20 exceeds plant benchmark by 35%',
      });
      expect(rejectWithReason.success).toBe(true);

      const rejectWithoutReason = updatePlanVersionStatusSchema.safeParse({
        status: 'REJECTED',
        rejectionReason: '',
      });
      expect(rejectWithoutReason.success).toBe(false);
    });

    it('validates version duplication branching parameters', () => {
      const result = duplicatePlanVersionSchema.safeParse({
        newVersionCode: 'v1-best',
        newVersionName: 'Best Case Scenario',
        scenarioLabel: 'Upside +15%',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.newVersionCode).toBe('V1-BEST');
      }
    });
  });
});
