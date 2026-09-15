import { z } from 'zod';

export const DRIVER_CATEGORIES = [
  'DEMAND',
  'REVENUE',
  'PRODUCTION',
  'INVENTORY',
  'MATERIAL',
  'LABOR',
  'MACHINE',
  'OVERHEAD',
  'OPEX',
  'HEADCOUNT',
  'WORKING_CAPITAL',
  'TAX',
  'FINANCING',
  'CAPEX',
] as const;

export const DRIVER_TYPES = [
  'RATE',
  'QUANTITY',
  'PERCENTAGE',
  'DURATION',
  'CAPACITY',
  'RATIO',
  'BOOLEAN',
  'AMOUNT',
] as const;

export const createDriverSchema = z
  .object({
    driverCode: z
      .string()
      .min(2, 'Driver code must be at least 2 characters')
      .max(50)
      .regex(/^[A-Za-z0-9-_.]+$/, 'Driver code must be alphanumeric with hyphens/underscores/periods')
      .toUpperCase()
      .trim(),
    driverName: z.string().min(2, 'Driver name must be at least 2 characters').max(100).trim(),
    description: z.string().max(500).optional().nullable(),
    driverCategory: z.enum(DRIVER_CATEGORIES),
    driverType: z.enum(DRIVER_TYPES),
    unitOfMeasure: z.string().min(1, 'Unit of measure is required').max(20).trim(),
    currency: z.string().length(3).toUpperCase().optional().nullable().default('USD'),
    defaultValue: z.number({ invalid_type_error: 'Default value must be numeric' }),
    isActive: z.boolean().default(true),
    effectiveFrom: z.string().datetime().optional().nullable(),
    effectiveTo: z.string().datetime().optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.effectiveFrom && data.effectiveTo) {
        return new Date(data.effectiveFrom) <= new Date(data.effectiveTo);
      }
      return true;
    },
    {
      message: 'Effective-from date must be on or before effective-to date',
      path: ['effectiveTo'],
    }
  );

export const updateDriverSchema = z.object({
  driverName: z.string().min(2).max(100).trim().optional(),
  description: z.string().max(500).optional().nullable(),
  driverCategory: z.enum(DRIVER_CATEGORIES).optional(),
  driverType: z.enum(DRIVER_TYPES).optional(),
  unitOfMeasure: z.string().min(1).max(20).trim().optional(),
  currency: z.string().length(3).toUpperCase().optional().nullable(),
  defaultValue: z.number().optional(),
  isActive: z.boolean().optional(),
  effectiveFrom: z.string().datetime().optional().nullable(),
  effectiveTo: z.string().datetime().optional().nullable(),
});

export const setPlanDriverValueSchema = z
  .object({
    planVersionId: z.string().min(1, 'Plan version is required'),
    driverId: z.string().min(1, 'Driver ID is required'),
    fiscalPeriodId: z.string().optional().nullable(),
    plantId: z.string().optional().nullable(),
    productId: z.string().optional().nullable(),
    driverValue: z.number({ invalid_type_error: 'Driver value must be a number' }),
    isOverridden: z.boolean().default(false),
    overrideReason: z.string().max(500).optional().nullable(),
    status: z.enum(['DRAFT', 'APPROVED', 'LOCKED']).default('DRAFT'),
    notes: z.string().max(1000).optional().nullable(),
  })
  .refine(
    (data) => {
      // If overridden, an override reason is mandatory
      if (data.isOverridden) {
        return !!data.overrideReason && data.overrideReason.trim().length >= 3;
      }
      return true;
    },
    {
      message: 'Override reason is required and must be at least 3 characters when marked as overridden',
      path: ['overrideReason'],
    }
  );
