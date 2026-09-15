import { describe, it, expect } from 'vitest';
import {
  createManagementTargetSchema,
  updateManagementTargetSchema,
  updateTargetStatusSchema,
  bulkTargetImportSchema,
} from '@/lib/validations/targets';
import {
  createAssumptionSchema,
  updateAssumptionSchema,
  copyAssumptionsSchema,
} from '@/lib/validations/assumptions';
import {
  createDriverSchema,
  updateDriverSchema,
  setPlanDriverValueSchema,
} from '@/lib/validations/drivers';
import {
  planInputSchema,
  batchPlanInputsSchema,
  versionCopySchema,
  versionComparisonQuerySchema,
} from '@/lib/validations/plan-inputs';

describe('Phase 3 Planning Inputs & Targets Validations (Unit)', () => {
  describe('Management Target Validations', () => {
    it('validates a valid management target payload', () => {
      const result = createManagementTargetSchema.safeParse({
        planningCycleId: 'cycle-123',
        planVersionId: 'version-123',
        fiscalPeriodId: 'period-123',
        targetMetric: 'REVENUE',
        targetValue: 1500000.5,
        unitOfMeasure: 'USD',
        currency: 'USD',
        sourceType: 'MANAGEMENT_SUBMISSION',
        notes: 'Executive Q1 Revenue Target',
      });
      expect(result.success).toBe(true);
    });

    it('rejects an invalid target metric', () => {
      const result = createManagementTargetSchema.safeParse({
        planningCycleId: 'cycle-123',
        planVersionId: 'version-123',
        fiscalPeriodId: 'period-123',
        targetMetric: 'UNKNOWN_METRIC',
        targetValue: 1000,
        unitOfMeasure: 'EA',
      });
      expect(result.success).toBe(false);
    });

    it('validates target status transitions', () => {
      const valid = updateTargetStatusSchema.safeParse({ status: 'APPROVED' });
      expect(valid.success).toBe(true);

      const invalid = updateTargetStatusSchema.safeParse({ status: 'INVALID_STATUS' });
      expect(invalid.success).toBe(false);
    });

    it('validates bulk target import array', () => {
      const result = bulkTargetImportSchema.safeParse({
        planningCycleId: 'cycle-1',
        planVersionId: 'ver-1',
        fileName: 'targets_q1.csv',
        rows: [
          {
            fiscalPeriodId: 'per-1',
            targetMetric: 'SALES_QUANTITY',
            targetValue: 5000,
            unitOfMeasure: 'EA',
          },
          {
            fiscalPeriodId: 'per-1',
            targetMetric: 'GROSS_MARGIN_PERCENT',
            targetValue: 42.0,
            unitOfMeasure: 'PERCENT',
          },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Assumption Validations', () => {
    it('validates numeric and percentage assumptions', () => {
      const result = createAssumptionSchema.safeParse({
        planningCycleId: 'cycle-123',
        planVersionId: 'version-123',
        code: 'inflation_cpi_2026',
        name: 'Projected Inflation CPI',
        category: 'OTHER',
        valueType: 'PERCENTAGE',
        numericValue: 3.4,
        unit: '%',
        confidenceLevel: 'HIGH',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.code).toBe('INFLATION_CPI_2026');
      }
    });

    it('validates text, boolean, and date value types', () => {
      const textResult = createAssumptionSchema.safeParse({
        planningCycleId: 'cycle-123',
        planVersionId: 'version-123',
        code: 'SUPPLIER_POLICY',
        name: 'Dual Sourcing Strategy',
        category: 'MATERIAL_COST',
        valueType: 'TEXT',
        textValue: 'Mandate minimum 30% second source',
      });
      expect(textResult.success).toBe(true);

      const boolResult = createAssumptionSchema.safeParse({
        planningCycleId: 'cycle-123',
        planVersionId: 'version-123',
        code: 'ENABLE_OVERTIME_SHIFTS',
        name: 'Weekend Overtime Allowed',
        category: 'LABOR_COST',
        valueType: 'BOOLEAN',
        booleanValue: true,
      });
      expect(boolResult.success).toBe(true);
    });

    it('validates copy assumptions schema with overwrite flag', () => {
      const result = copyAssumptionsSchema.safeParse({
        sourceVersionId: 'ver-source',
        targetVersionId: 'ver-target',
        overwrite: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Planning Driver Validations', () => {
    it('validates driver creation with code uppercase transformation', () => {
      const result = createDriverSchema.safeParse({
        driverCode: 'drv-scrap-detroit',
        driverName: 'Detroit Plant Sheet Metal Scrap',
        driverCategory: 'PRODUCTION',
        driverType: 'PERCENTAGE',
        unitOfMeasure: '%',
        defaultValue: 2.5,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.driverCode).toBe('DRV-SCRAP-DETROIT');
      }
    });

    it('enforces override reason when driver is marked overridden', () => {
      // Overridden without reason -> FAIL
      const failed = setPlanDriverValueSchema.safeParse({
        planVersionId: 'ver-1',
        driverId: 'drv-1',
        driverValue: 3.8,
        isOverridden: true,
        overrideReason: '',
      });
      expect(failed.success).toBe(false);

      // Overridden with reason -> PASS
      const passed = setPlanDriverValueSchema.safeParse({
        planVersionId: 'ver-1',
        driverId: 'drv-1',
        driverValue: 3.8,
        isOverridden: true,
        overrideReason: 'Vendor scrap renegotiation following tooling defect',
      });
      expect(passed.success).toBe(true);

      // Not overridden -> PASS without reason
      const notOverridden = setPlanDriverValueSchema.safeParse({
        planVersionId: 'ver-1',
        driverId: 'drv-1',
        driverValue: 2.5,
        isOverridden: false,
      });
      expect(notOverridden.success).toBe(true);
    });
  });

  describe('Plan Input & Version Copy / Comparison Validations', () => {
    it('validates single plan input schema', () => {
      const result = planInputSchema.safeParse({
        planningCycleId: 'cycle-1',
        planVersionId: 'ver-1',
        fiscalPeriodId: 'per-1',
        inputCategory: 'DEMAND',
        inputCode: 'SALES_VOLUME',
        inputValue: 12500,
        unitOfMeasure: 'EA',
        sourceType: 'MANUAL',
      });
      expect(result.success).toBe(true);
    });

    it('enforces override reason when plan input is marked overridden', () => {
      const failed = planInputSchema.safeParse({
        planningCycleId: 'cycle-1',
        planVersionId: 'ver-1',
        fiscalPeriodId: 'per-1',
        inputCategory: 'DEMAND',
        inputCode: 'SALES_VOLUME',
        inputValue: 15000,
        unitOfMeasure: 'EA',
        sourceType: 'MANUAL',
        isOverridden: true,
        overrideReason: '',
      });
      expect(failed.success).toBe(false);

      const passed = planInputSchema.safeParse({
        planningCycleId: 'cycle-1',
        planVersionId: 'ver-1',
        fiscalPeriodId: 'per-1',
        inputCategory: 'DEMAND',
        inputCode: 'SALES_VOLUME',
        inputValue: 15000,
        unitOfMeasure: 'EA',
        sourceType: 'MANUAL',
        isOverridden: true,
        overrideReason: 'Executive commercial override for new customer signing',
      });
      expect(passed.success).toBe(true);
    });

    it('validates batch plan inputs payload', () => {
      const result = batchPlanInputsSchema.safeParse({
        planningCycleId: 'cycle-1',
        planVersionId: 'ver-1',
        inputs: [
          {
            planningCycleId: 'cycle-1',
            planVersionId: 'ver-1',
            fiscalPeriodId: 'per-1',
            inputCategory: 'DEMAND',
            inputCode: 'SALES_VOLUME',
            inputValue: 500,
            unitOfMeasure: 'EA',
          },
          {
            planningCycleId: 'cycle-1',
            planVersionId: 'ver-1',
            fiscalPeriodId: 'per-1',
            inputCategory: 'PRODUCTION',
            inputCode: 'PRODUCTION_VOLUME',
            inputValue: 520,
            unitOfMeasure: 'EA',
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('validates version copy schema with overwrite policies', () => {
      const validCopy = versionCopySchema.safeParse({
        sourceVersionId: 'ver-source',
        targetVersionId: 'ver-target',
        categories: ['TARGETS', 'ASSUMPTIONS', 'DRIVERS', 'INPUTS'],
        overwritePolicy: 'OVERWRITE',
      });
      expect(validCopy.success).toBe(true);

      const invalidPolicy = versionCopySchema.safeParse({
        sourceVersionId: 'ver-source',
        targetVersionId: 'ver-target',
        categories: ['TARGETS'],
        overwritePolicy: 'INVALID_POLICY',
      });
      expect(invalidPolicy.success).toBe(false);
    });

    it('validates version comparison query parameters', () => {
      const valid = versionComparisonQuerySchema.safeParse({
        sourceVersionId: 'ver-base',
        targetVersionId: 'ver-comp',
        category: 'DEMAND',
      });
      expect(valid.success).toBe(true);

      const missing = versionComparisonQuerySchema.safeParse({
        sourceVersionId: 'ver-base',
      });
      expect(missing.success).toBe(false);
    });
  });
});
