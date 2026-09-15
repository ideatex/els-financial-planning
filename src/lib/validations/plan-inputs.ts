import { z } from 'zod';

export const INPUT_CATEGORIES = [
  'DEMAND',
  'PRODUCTION',
  'MATERIAL',
  'LABOR',
  'OVERHEAD',
  'OPEX',
] as const;

export const INPUT_SOURCE_TYPES = [
  'MANUAL',
  'IMPORT',
  'MANAGEMENT_TARGET',
  'ASSUMPTION',
  'DRIVER',
  'PRIOR_PLAN_VERSION',
  'ACTUALS',
  'EXTERNAL_INTEGRATION',
  'SCENARIO_BASELINE',
  'SCENARIO_DELTA',
] as const;

export const INPUT_STATUSES = [
  'DRAFT',
  'VALID',
  'INVALID',
  'OVERRIDDEN',
  'SUBMITTED',
  'APPROVED',
  'LOCKED',
] as const;

export const planInputSchema = z
  .object({
    planningCycleId: z.string().min(1, 'Planning cycle is required'),
    planVersionId: z.string().min(1, 'Plan version is required'),
    fiscalPeriodId: z.string().min(1, 'Fiscal period is required'),
    plantId: z.string().optional().nullable(),
    productId: z.string().optional().nullable(),
    materialId: z.string().optional().nullable(),
    accountId: z.string().optional().nullable(),
    driverId: z.string().optional().nullable(),
    inputCategory: z.enum(INPUT_CATEGORIES),
    inputCode: z.string().min(2).max(50).trim().toUpperCase(),
    inputValue: z.number({ invalid_type_error: 'Input value must be a number' }),
    unitOfMeasure: z.string().min(1).max(20).trim(),
    currency: z.string().length(3).toUpperCase().optional().nullable().default('USD'),
    sourceType: z.enum(INPUT_SOURCE_TYPES).default('MANUAL'),
    sourceReference: z.string().max(200).optional().nullable(),
    isOverridden: z.boolean().default(false),
    overrideReason: z.string().max(500).optional().nullable(),
    status: z.enum(INPUT_STATUSES).default('DRAFT'),
    notes: z.string().max(1000).optional().nullable(),
  })
  .refine(
    (data) => {
      // Overridden inputs MUST have a reason
      if (data.isOverridden) {
        return !!data.overrideReason && data.overrideReason.trim().length >= 3;
      }
      return true;
    },
    {
      message: 'Override reason is required (min 3 chars) when input is overridden',
      path: ['overrideReason'],
    }
  )
  .refine(
    (data) => {
      // Metric constraints:
      // Percentage codes (ending in _PCT or containing PERCENT or YIELD or SCRAP) must be between 0 and 100
      if (
        data.inputCode.includes('PCT') ||
        data.inputCode.includes('PERCENT') ||
        data.inputCode.includes('YIELD') ||
        data.inputCode.includes('UTILIZATION')
      ) {
        return data.inputValue >= 0 && data.inputValue <= 100;
      }
      // Quantities & Hours must not be negative
      if (
        data.inputCode.includes('QUANTITY') ||
        data.inputCode.includes('VOLUME') ||
        data.inputCode.includes('INVENTORY') ||
        data.inputCode.includes('HOURS') ||
        data.inputCode.includes('HEADCOUNT')
      ) {
        return data.inputValue >= 0;
      }
      // Price & Rate must not be negative
      if (data.inputCode.includes('PRICE') || data.inputCode.includes('RATE')) {
        return data.inputValue >= 0;
      }
      return true;
    },
    {
      message: 'Input value violates dimension/metric constraints (e.g. non-negative quantity/price, percentage range 0-100)',
      path: ['inputValue'],
    }
  );

export const batchPlanInputsSchema = z.object({
  planningCycleId: z.string().min(1),
  planVersionId: z.string().min(1),
  inputs: z.array(planInputSchema).min(1, 'At least one input required'),
});

export const versionCopySchema = z.object({
  sourceVersionId: z.string().min(1, 'Source version is required'),
  targetVersionId: z.string().min(1, 'Target version is required'),
  categories: z
    .array(z.enum(['TARGETS', 'ASSUMPTIONS', 'DRIVERS', 'INPUTS']))
    .min(1, 'Select at least one category to copy'),
  overwritePolicy: z.enum(['OVERWRITE', 'SKIP']).default('SKIP'),
});

export const versionComparisonQuerySchema = z.object({
  sourceVersionId: z.string().min(1, 'Source version is required'),
  targetVersionId: z.string().min(1, 'Target version is required'),
  category: z.enum(['ALL', 'TARGETS', 'ASSUMPTIONS', 'DRIVERS', 'INPUTS', 'DEMAND', 'PRODUCTION', 'OPEX']).default('ALL'),
});
