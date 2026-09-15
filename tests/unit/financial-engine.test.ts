import { describe, it, expect } from 'vitest';
import { FinancialDecimal, dec } from '@/financial-engine/domain/decimal';
import { CalculationRunner } from '@/financial-engine/pipeline/calculation-runner';
import { createCalculationContext } from '@/financial-engine/pipeline/calculation-context';
import { InputSnapshot } from '@/financial-engine/domain/types/snapshot.types';
import { CalculationRunStatus, ValidationSeverity } from '@/financial-engine/domain/enums';

describe('Financial Engine Unit Tests & Decimal Strategy', () => {
  describe('1. FinancialDecimal Arithmetic & Precision Strategy', () => {
    it('eliminates standard floating point drift', () => {
      // In normal JS: 0.1 + 0.2 = 0.30000000000000004
      const a = dec(0.1);
      const b = dec(0.2);
      const sum = a.plus(b);
      expect(sum.toNumber()).toBe(0.3);
      expect(sum.toFixed(2)).toBe('0.30');
    });

    it('performs exact multiplication and division with HALF_UP rounding', () => {
      // 1000 units * 12.3456 price = 12345.60
      const qty = dec(1000);
      const price = dec(12.3456);
      const total = qty.times(price);
      expect(total.toDecimalPlaces(2)).toBe(12345.60);

      // Division
      const div = dec(100).dividedBy(3);
      expect(div.toDecimalPlaces(2)).toBe(33.33);
      expect(div.toDecimalPlaces(4)).toBe(33.3333);
    });

    it('handles negative and zero values correctly', () => {
      const zero = dec(0);
      expect(zero.isZero()).toBe(true);
      expect(zero.isPositive()).toBe(false);

      const neg = dec(-50);
      expect(neg.isNegative()).toBe(true);
      expect(neg.abs().toNumber()).toBe(50);
    });

    it('throws on division by zero', () => {
      expect(() => dec(100).dividedBy(0)).toThrow('division by zero');
    });
  });

  describe('2. Section 25 Initial Baseline Test Scenario', () => {
    /**
     * Baseline Specification:
     * Organization: Demo Manufacturing Ltd.
     * Plant: Chennai Plant
     * Product: Product A
     * Fiscal Period: January 2027
     * Beginning Inventory: 100 units
     * Planned Sales: 1,000 units
     * Target Ending Inventory: 200 units
     * Selling Price: ₹500
     * Material Cost per Unit: ₹180
     * Labor Hours per Unit: 0.5
     * Labor Rate: ₹200 per hour
     * Overhead Cost per Unit: ₹40
     * Monthly Opex: ₹100,000
     */
    it('matches exact expected deterministic results', async () => {
      const context = createCalculationContext({
        organizationId: 'org-demo',
        planningCycleId: 'cycle-2027',
        planVersionId: 'ver-base',
        fiscalPeriodId: 'period-jan2027',
        plantId: 'plant-chennai',
        productId: 'prod-a',
        currency: 'INR',
        userId: 'user-planner',
      });

      const snapshot: InputSnapshot = {
        snapshotId: 'snap-test-01',
        snapshotHash: 'hash-test-01',
        organizationId: 'org-demo',
        planningCycleId: 'cycle-2027',
        planVersionId: 'ver-base',
        fiscalPeriodId: 'period-jan2027',
        plantId: 'plant-chennai',
        productId: 'prod-a',
        currency: 'INR',
        periodDays: 31,
        product: {
          id: 'prod-a',
          code: 'PROD-A',
          name: 'Product A',
          standardPriceCents: 50000, // 500.00
        },
        plant: {
          id: 'plant-chennai',
          code: 'CHENNAI-01',
          name: 'Chennai Plant',
        },
        bom: null,
        routing: null,
        inputs: {
          SALES_VOLUME: {
            inputCategory: 'DEMAND',
            inputCode: 'SALES_VOLUME',
            inputValue: 1000,
            unitOfMeasure: 'EA',
            sourceType: 'MANUAL',
            isOverridden: false,
          },
          SELLING_PRICE: {
            inputCategory: 'DEMAND',
            inputCode: 'SELLING_PRICE',
            inputValue: 500,
            unitOfMeasure: 'INR',
            sourceType: 'MANUAL',
            isOverridden: false,
          },
          BEGINNING_INVENTORY: {
            inputCategory: 'PRODUCTION',
            inputCode: 'BEGINNING_INVENTORY',
            inputValue: 100,
            unitOfMeasure: 'EA',
            sourceType: 'ACTUALS',
            isOverridden: false,
          },
          TARGET_ENDING_INVENTORY: {
            inputCategory: 'PRODUCTION',
            inputCode: 'TARGET_ENDING_INVENTORY',
            inputValue: 200,
            unitOfMeasure: 'EA',
            sourceType: 'MANUAL',
            isOverridden: false,
          },
          MATERIAL_COST_PER_UNIT: {
            inputCategory: 'MATERIAL',
            inputCode: 'MATERIAL_COST_PER_UNIT',
            inputValue: 180,
            unitOfMeasure: 'INR',
            sourceType: 'MANUAL',
            isOverridden: false,
          },
          LABOR_HOURS_PER_UNIT: {
            inputCategory: 'LABOR',
            inputCode: 'LABOR_HOURS_PER_UNIT',
            inputValue: 0.5,
            unitOfMeasure: 'HRS',
            sourceType: 'MANUAL',
            isOverridden: false,
          },
          LABOR_RATE: {
            inputCategory: 'LABOR',
            inputCode: 'LABOR_RATE',
            inputValue: 200,
            unitOfMeasure: 'INR/HR',
            sourceType: 'MANUAL',
            isOverridden: false,
          },
          OVERHEAD_COST_PER_UNIT: {
            inputCategory: 'OVERHEAD',
            inputCode: 'OVERHEAD_COST_PER_UNIT',
            inputValue: 40,
            unitOfMeasure: 'INR/EA',
            sourceType: 'MANUAL',
            isOverridden: false,
          },
          MONTHLY_OPEX: {
            inputCategory: 'OPEX',
            inputCode: 'MONTHLY_OPEX',
            inputValue: 100000,
            unitOfMeasure: 'INR',
            sourceType: 'MANUAL',
            isOverridden: false,
          },
        },
        opexInputs: [],
        assumptions: {},
        drivers: {},
        metadata: {
          createdAt: new Date().toISOString(),
          versionName: '2027 Baseline',
          periodName: 'January 2027',
        },
      };

      const runner = new CalculationRunner();
      const result = await runner.execute(context, snapshot);

      expect(result.status).toBe(CalculationRunStatus.COMPLETED);
      expect(result.errorCount).toBe(0);

      const s = result.summary;

      // 1. Production Quantity: 1,100 units (1,000 + 200 - 100)
      expect(s.netProductionQuantity).toBe(1100);
      expect(s.grossProductionQuantity).toBe(1100);

      // 2. Revenue: ₹500,000 (1,000 units * ₹500)
      expect(s.revenue).toBe(500000);

      // 3. Material Cost: ₹198,000 (1,100 units * ₹180)
      expect(s.materialCost).toBe(198000);

      // 4. Labor Cost: ₹110,000 (1,100 units * 0.5 hrs * ₹200/hr)
      expect(s.laborCost).toBe(110000);

      // 5. Overhead Cost: ₹44,000 (1,100 units * ₹40)
      expect(s.overheadCost).toBe(44000);

      // 6. Total Production Cost (COGM): ₹352,000 (₹198k + ₹110k + ₹44k)
      expect(s.totalProductionCost).toBe(352000);

      // 7. Standard Unit Cost: ₹320 (₹180 + ₹100 + ₹40)
      expect(s.standardUnitCost).toBe(320);

      // 8. COGS: ₹320,000 (1,000 units * ₹320)
      expect(s.cogs).toBe(320000);

      // 9. Gross Profit: ₹180,000 (₹500,000 - ₹320,000)
      expect(s.grossProfit).toBe(180000);
      expect(s.grossMarginPercentage).toBe(36.0);

      // 10. Operating Profit: ₹80,000 (₹180,000 - ₹100,000)
      expect(s.totalOpex).toBe(100000);
      expect(s.operatingProfit).toBe(80000);
      expect(s.operatingMarginPercentage).toBe(16.0);
    });
  });

  describe('3. Edge Cases & Boundary Conditions', () => {
    it('handles scrap and yield correctly in production planning', async () => {
      const context = createCalculationContext({
        organizationId: 'org-test',
        planningCycleId: 'cycle-1',
        planVersionId: 'ver-1',
        fiscalPeriodId: 'p1',
        plantId: 'pl-1',
        productId: 'pr-1',
        userId: 'u1',
      });

      const snapshot: InputSnapshot = {
        snapshotId: 'snap-scrap',
        snapshotHash: 'hash-scrap',
        organizationId: 'org-test',
        planningCycleId: 'cycle-1',
        planVersionId: 'ver-1',
        fiscalPeriodId: 'p1',
        plantId: 'pl-1',
        productId: 'pr-1',
        currency: 'USD',
        periodDays: 30,
        product: { id: 'pr-1', code: 'P1', name: 'Product', standardPriceCents: 1000 },
        plant: { id: 'pl-1', code: 'PL1', name: 'Plant' },
        bom: null,
        routing: null,
        inputs: {
          SALES_VOLUME: { inputCategory: 'DEMAND', inputCode: 'SALES_VOLUME', inputValue: 1000, unitOfMeasure: 'EA', sourceType: 'MANUAL', isOverridden: false },
          SELLING_PRICE: { inputCategory: 'DEMAND', inputCode: 'SELLING_PRICE', inputValue: 10, unitOfMeasure: 'USD', sourceType: 'MANUAL', isOverridden: false },
          SCRAP_PCT: { inputCategory: 'PRODUCTION', inputCode: 'SCRAP_PCT', inputValue: 5.0, unitOfMeasure: '%', sourceType: 'MANUAL', isOverridden: false },
          MATERIAL_COST_PER_UNIT: { inputCategory: 'MATERIAL', inputCode: 'MATERIAL_COST_PER_UNIT', inputValue: 2, unitOfMeasure: 'USD', sourceType: 'MANUAL', isOverridden: false },
          LABOR_HOURS_PER_UNIT: { inputCategory: 'LABOR', inputCode: 'LABOR_HOURS_PER_UNIT', inputValue: 0.1, unitOfMeasure: 'HRS', sourceType: 'MANUAL', isOverridden: false },
          LABOR_RATE: { inputCategory: 'LABOR', inputCode: 'LABOR_RATE', inputValue: 20, unitOfMeasure: 'USD/HR', sourceType: 'MANUAL', isOverridden: false },
        },
        opexInputs: [],
        assumptions: {},
        drivers: {},
        metadata: { createdAt: '', versionName: '', periodName: '' },
      };

      const runner = new CalculationRunner();
      const res = await runner.execute(context, snapshot);

      expect(res.status).toBe(CalculationRunStatus.COMPLETED);
      // Net = 1000, Scrap 5% = 50, Gross = 1050
      expect(res.summary.netProductionQuantity).toBe(1000);
      expect(res.summary.scrapQuantity).toBe(50);
      expect(res.summary.grossProductionQuantity).toBe(1050);
    });

    it('fails gracefully when required sales volume is missing', async () => {
      const context = createCalculationContext({
        organizationId: 'org-test',
        planningCycleId: 'cycle-1',
        planVersionId: 'ver-1',
        fiscalPeriodId: 'p1',
        plantId: 'pl-1',
        productId: 'pr-1',
        userId: 'u1',
      });

      const snapshot: InputSnapshot = {
        snapshotId: 'snap-missing',
        snapshotHash: 'hash-missing',
        organizationId: 'org-test',
        planningCycleId: 'cycle-1',
        planVersionId: 'ver-1',
        fiscalPeriodId: 'p1',
        plantId: 'pl-1',
        productId: 'pr-1',
        currency: 'USD',
        periodDays: 30,
        product: { id: 'pr-1', code: 'P1', name: 'Product', standardPriceCents: 0 },
        plant: { id: 'pl-1', code: 'PL1', name: 'Plant' },
        bom: null,
        routing: null,
        inputs: {},
        opexInputs: [],
        assumptions: {},
        drivers: {},
        metadata: { createdAt: '', versionName: '', periodName: '' },
      };

      const runner = new CalculationRunner();
      const res = await runner.execute(context, snapshot);

      expect(res.status).toBe(CalculationRunStatus.FAILED);
      expect(res.errorCount).toBeGreaterThan(0);
      expect(res.validations.some((v) => v.code === 'MISSING_SALES_VOLUME')).toBe(true);
    });
  });
});
