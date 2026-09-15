import { z } from 'zod';

export const ASSUMPTION_CATEGORIES = [
  'PRICING',
  'SALES_VOLUME',
  'INVENTORY',
  'PRODUCTION',
  'MATERIAL_COST',
  'LABOR_COST',
  'OVERHEAD',
  'OPERATING_EXPENSE',
  'HEADCOUNT',
  'TAX',
  'INTEREST',
  'WORKING_CAPITAL',
  'CAPITAL_EXPENDITURE',
  'FOREIGN_EXCHANGE',
  'OTHER',
] as const;

export const ASSUMPTION_VALUE_TYPES = [
  'NUMBER',
  'PERCENTAGE',
  'CURRENCY',
  'QUANTITY',
  'BOOLEAN',
  'TEXT',
  'DATE',
] as const;

export const CONFIDENCE_LEVELS = ['HIGH', 'MEDIUM', 'LOW'] as const;

export const createAssumptionSchema = z
  .object({
    planningCycleId: z.string().min(1, 'Planning cycle is required'),
    planVersionId: z.string().min(1, 'Plan version is required'),
    name: z.string().min(2, 'Name must be at least 2 characters').max(100).trim(),
    code: z
      .string()
      .min(2, 'Code must be at least 2 characters')
      .max(50)
      .regex(/^[A-Za-z0-9-_.]+$/, 'Code must be alphanumeric with hyphens/underscores/periods')
      .toUpperCase()
      .trim(),
    description: z.string().max(500).optional().nullable(),
    category: z.enum(ASSUMPTION_CATEGORIES),
    valueType: z.enum(ASSUMPTION_VALUE_TYPES),
    numericValue: z.number().optional().nullable(),
    textValue: z.string().max(1000).optional().nullable(),
    booleanValue: z.boolean().optional().nullable(),
    dateValue: z.string().datetime().optional().nullable(),
    unit: z.string().max(20).optional().nullable(),
    currency: z.string().length(3).toUpperCase().optional().nullable().default('USD'),
    effectiveFromPeriodId: z.string().optional().nullable(),
    effectiveToPeriodId: z.string().optional().nullable(),
    plantId: z.string().optional().nullable(),
    productId: z.string().optional().nullable(),
    accountId: z.string().optional().nullable(),
    source: z.string().max(200).optional().nullable(),
    confidenceLevel: z.enum(CONFIDENCE_LEVELS).default('MEDIUM'),
    status: z.enum(['DRAFT', 'APPROVED', 'LOCKED']).default('DRAFT'),
    notes: z.string().max(1000).optional().nullable(),
  })
  .refine(
    (data) => {
      // Must provide value corresponding to valueType
      if (['NUMBER', 'PERCENTAGE', 'CURRENCY', 'QUANTITY'].includes(data.valueType)) {
        return typeof data.numericValue === 'number';
      }
      if (data.valueType === 'BOOLEAN') {
        return typeof data.booleanValue === 'boolean';
      }
      if (data.valueType === 'TEXT') {
        return typeof data.textValue === 'string' && data.textValue.trim().length > 0;
      }
      if (data.valueType === 'DATE') {
        return !!data.dateValue;
      }
      return true;
    },
    {
      message: 'Value must match the specified valueType',
      path: ['numericValue'],
    }
  );

export const updateAssumptionSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  description: z.string().max(500).optional().nullable(),
  category: z.enum(ASSUMPTION_CATEGORIES).optional(),
  valueType: z.enum(ASSUMPTION_VALUE_TYPES).optional(),
  numericValue: z.number().optional().nullable(),
  textValue: z.string().max(1000).optional().nullable(),
  booleanValue: z.boolean().optional().nullable(),
  dateValue: z.string().datetime().optional().nullable(),
  unit: z.string().max(20).optional().nullable(),
  currency: z.string().length(3).toUpperCase().optional().nullable(),
  effectiveFromPeriodId: z.string().optional().nullable(),
  effectiveToPeriodId: z.string().optional().nullable(),
  plantId: z.string().optional().nullable(),
  productId: z.string().optional().nullable(),
  accountId: z.string().optional().nullable(),
  source: z.string().max(200).optional().nullable(),
  confidenceLevel: z.enum(CONFIDENCE_LEVELS).optional(),
  status: z.enum(['DRAFT', 'APPROVED', 'LOCKED']).optional(),
  notes: z.string().max(1000).optional().nullable(),
});

export const copyAssumptionsSchema = z.object({
  sourceVersionId: z.string().min(1, 'Source version is required'),
  targetVersionId: z.string().min(1, 'Target version is required'),
  overwritePolicy: z.enum(['OVERWRITE', 'SKIP']).default('SKIP'),
});
