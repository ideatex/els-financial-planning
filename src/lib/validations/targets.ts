import { z } from 'zod';

export const TARGET_METRICS = [
  'REVENUE',
  'SALES_QUANTITY',
  'GROSS_PROFIT',
  'OPERATING_PROFIT',
  'PRODUCTION_QUANTITY',
  'ENDING_INVENTORY',
  'OPERATING_EXPENSE',
  'HEADCOUNT',
  'CAPEX',
  'CASH_BALANCE',
  'WORKING_CAPITAL',
  'GROSS_MARGIN_PERCENT',
] as const;

export const TARGET_SOURCE_TYPES = [
  'MANUAL_ENTRY',
  'EXCEL_IMPORT',
  'CSV_IMPORT',
  'MANAGEMENT_SUBMISSION',
  'APPROVED_BASELINE',
  'EXTERNAL_SYSTEM',
] as const;

export const TARGET_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'LOCKED',
] as const;

export const createManagementTargetSchema = z
  .object({
    planningCycleId: z.string().min(1, 'Planning cycle is required'),
    planVersionId: z.string().min(1, 'Plan version is required'),
    fiscalPeriodId: z.string().min(1, 'Fiscal period is required'),
    plantId: z.string().optional().nullable(),
    productId: z.string().optional().nullable(),
    accountId: z.string().optional().nullable(),
    targetMetric: z.enum(TARGET_METRICS, {
      errorMap: () => ({ message: 'Invalid target metric' }),
    }),
    targetValue: z.number({ invalid_type_error: 'Target value must be a number' }),
    unitOfMeasure: z.string().min(1, 'Unit of measure is required').max(20).trim(),
    currency: z.string().length(3, 'Currency must be 3-letter ISO code').toUpperCase().default('USD'),
    sourceType: z.enum(TARGET_SOURCE_TYPES).default('MANUAL_ENTRY'),
    sourceReference: z.string().max(200).optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
    status: z.enum(TARGET_STATUSES).default('DRAFT'),
  })
  .refine(
    (data) => {
      // Percentage metrics must be between -100 and 100
      if (data.targetMetric === 'GROSS_MARGIN_PERCENT') {
        return data.targetValue >= -100 && data.targetValue <= 100;
      }
      // Quantities & Headcount cannot be negative
      if (
        data.targetMetric === 'SALES_QUANTITY' ||
        data.targetMetric === 'PRODUCTION_QUANTITY' ||
        data.targetMetric === 'ENDING_INVENTORY' ||
        data.targetMetric === 'HEADCOUNT'
      ) {
        return data.targetValue >= 0;
      }
      return true;
    },
    {
      message: 'Target value violates dimensional metric boundary rules (e.g. non-negative quantity, % in range)',
      path: ['targetValue'],
    }
  );

export const updateManagementTargetSchema = z
  .object({
    targetValue: z.number().optional(),
    unitOfMeasure: z.string().min(1).max(20).trim().optional(),
    currency: z.string().length(3).toUpperCase().optional(),
    sourceType: z.enum(TARGET_SOURCE_TYPES).optional(),
    sourceReference: z.string().max(200).optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
    status: z.enum(TARGET_STATUSES).optional(),
  })
  .refine(
    (data) => {
      if (data.targetValue !== undefined) {
        return true; // Detailed metric check done in service against existing record
      }
      return true;
    },
    { message: 'Invalid target value' }
  );

export const updateTargetStatusSchema = z.object({
  status: z.enum(TARGET_STATUSES),
  rejectionReason: z.string().max(500).optional().nullable(),
});

export const bulkTargetImportRowSchema = z.object({
  fiscalPeriodId: z.string().min(1, 'Fiscal period is required'),
  plantId: z.string().optional().nullable(),
  productId: z.string().optional().nullable(),
  accountId: z.string().optional().nullable(),
  targetMetric: z.enum(TARGET_METRICS),
  targetValue: z.number(),
  unitOfMeasure: z.string().min(1).max(20),
  currency: z.string().length(3).default('USD'),
  sourceType: z.enum(TARGET_SOURCE_TYPES).default('CSV_IMPORT'),
  sourceReference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const bulkTargetImportSchema = z.object({
  planningCycleId: z.string().min(1),
  planVersionId: z.string().min(1),
  fileName: z.string().default('import.csv'),
  rows: z.array(bulkTargetImportRowSchema).min(1, 'At least one target row required for import'),
});
