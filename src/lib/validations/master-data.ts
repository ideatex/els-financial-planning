import { z } from 'zod';

// ==========================================
// 1. Plant Validation Schemas
// ==========================================
export const createPlantSchema = z.object({
  code: z
    .string()
    .min(2, 'Plant code must be at least 2 characters')
    .max(20)
    .regex(/^[A-Za-z0-9-_]+$/, 'Code can only contain letters, numbers, hyphens and underscores')
    .toUpperCase()
    .trim(),
  name: z.string().min(2, 'Plant name must be at least 2 characters').max(100).trim(),
  description: z.string().max(500).optional().nullable(),
  address: z.string().max(200).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  country: z.string().min(2).max(100).default('USA'),
  timeZone: z.string().min(2).max(100).default('America/Detroit'),
  baseCurrency: z.string().length(3, 'Currency must be 3-letter ISO code').toUpperCase().default('USD'),
  isActive: z.boolean().default(true),
});

export const updatePlantSchema = createPlantSchema.partial().omit({ code: true });

// ==========================================
// 2. Product Validation Schemas
// ==========================================
export const ProductTypes = [
  'FINISHED_GOOD',
  'SEMI_FINISHED_GOOD',
  'RAW_MATERIAL',
  'PACKAGING',
  'SERVICE',
  'OTHER',
] as const;

export const baseProductSchema = z.object({
  code: z
    .string()
    .min(2, 'Product SKU must be at least 2 characters')
    .max(50)
    .regex(/^[A-Za-z0-9-_.]+$/, 'SKU can only contain letters, numbers, hyphens, periods, underscores')
    .toUpperCase()
    .trim(),
  name: z.string().min(2, 'Product name must be at least 2 characters').max(150).trim(),
  description: z.string().max(500).optional().nullable(),
  category: z.string().min(1, 'Category is required').max(100).trim(),
  productType: z.enum(ProductTypes),
  unitOfMeasure: z.string().min(1, 'Unit of measure is required').max(20).toUpperCase().trim(),
  defaultPlantId: z.string().optional().nullable(),
  standardPriceCents: z.number().int().min(0, 'Price must be non-negative'),
  currency: z.string().length(3, 'Currency must be 3-letter ISO code').toUpperCase().default('USD'),
  isActive: z.boolean().default(true),
  effectiveFrom: z.string().datetime().optional().nullable(),
  effectiveTo: z.string().datetime().optional().nullable(),
});

export const createProductSchema = baseProductSchema.refine(
  (data) => {
    if (data.effectiveFrom && data.effectiveTo) {
      return new Date(data.effectiveFrom) <= new Date(data.effectiveTo);
    }
    return true;
  },
  {
    message: 'Effective-from date must be prior to or equal to effective-to date',
    path: ['effectiveTo'],
  }
);

export const updateProductSchema = baseProductSchema.partial().omit({ code: true }).refine(
  (data) => {
    if (data.effectiveFrom && data.effectiveTo) {
      return new Date(data.effectiveFrom) <= new Date(data.effectiveTo);
    }
    return true;
  },
  {
    message: 'Effective-from date must be prior to or equal to effective-to date',
    path: ['effectiveTo'],
  }
);

// ==========================================
// 3. Material Validation Schemas
// ==========================================
export const createMaterialSchema = z.object({
  code: z
    .string()
    .min(2, 'Material code must be at least 2 characters')
    .max(50)
    .regex(/^[A-Za-z0-9-_.]+$/, 'Code can only contain letters, numbers, hyphens, periods, underscores')
    .toUpperCase()
    .trim(),
  name: z.string().min(2, 'Material name must be at least 2 characters').max(150).trim(),
  description: z.string().max(500).optional().nullable(),
  category: z.string().min(1, 'Category is required').max(100).trim(),
  unitOfMeasure: z.string().min(1, 'Unit of measure is required').max(20).toUpperCase().trim(),
  defaultCostCents: z.number().int().min(0, 'Default cost must be non-negative'),
  currency: z.string().length(3, 'Currency must be 3-letter ISO code').toUpperCase().default('USD'),
  supplierReference: z.string().max(100).optional().nullable(),
  leadTimeDays: z.number().int().min(0, 'Lead time must be non-negative').default(0),
  isActive: z.boolean().default(true),
});

export const updateMaterialSchema = createMaterialSchema.partial().omit({ code: true });

// ==========================================
// 4. Bill of Materials (BOM) Schemas
// ==========================================
export const createBomHeaderSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  name: z.string().min(2, 'BOM name must be at least 2 characters').max(100).trim(),
  description: z.string().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const createBomVersionSchema = z.object({
  versionNumber: z.number().int().min(1, 'Version number must be at least 1'),
  effectiveFrom: z.string().datetime().optional().nullable(),
  effectiveTo: z.string().datetime().optional().nullable(),
});

export const addBomLineSchema = z.object({
  componentType: z.enum(['MATERIAL', 'PRODUCT']),
  materialId: z.string().optional().nullable(),
  componentProductId: z.string().optional().nullable(),
  quantityPerUnit: z.number().positive('Quantity per unit must be strictly positive'),
  unitOfMeasure: z.string().min(1).max(20).toUpperCase(),
  scrapPercentage: z.number().min(0).max(100, 'Scrap percentage must be between 0 and 100').default(0),
}).refine(
  (data) => {
    if (data.componentType === 'MATERIAL') return !!data.materialId;
    if (data.componentType === 'PRODUCT') return !!data.componentProductId;
    return false;
  },
  {
    message: 'Either materialId or componentProductId must be provided corresponding to componentType',
    path: ['componentType'],
  }
);

export const updateBomVersionStatusSchema = z.object({
  status: z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'ARCHIVED']),
});

// ==========================================
// 5. Routing and Operations Schemas
// ==========================================
export const createRoutingHeaderSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  plantId: z.string().min(1, 'Plant ID is required'),
  name: z.string().min(2, 'Routing name must be at least 2 characters').max(100).trim(),
  description: z.string().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const createRoutingVersionSchema = z.object({
  versionNumber: z.number().int().min(1, 'Version number must be at least 1'),
  effectiveFrom: z.string().datetime().optional().nullable(),
  effectiveTo: z.string().datetime().optional().nullable(),
});

export const addRoutingOperationSchema = z.object({
  sequence: z.number().int().min(1, 'Sequence must be positive (e.g. 10, 20)'),
  operationName: z.string().min(2).max(100).trim(),
  workCenter: z.string().min(2).max(100).trim(),
  description: z.string().max(500).optional().nullable(),
  setupTimeMinutes: z.number().min(0, 'Setup time cannot be negative').default(0),
  runTimePerUnitMinutes: z.number().min(0, 'Run time cannot be negative').default(0),
  laborHoursPerUnit: z.number().min(0, 'Labor hours cannot be negative').default(0),
  machineHoursPerUnit: z.number().min(0, 'Machine hours cannot be negative').default(0),
  capacityUnit: z.string().max(20).default('HOURS'),
});

export const updateRoutingVersionStatusSchema = z.object({
  status: z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'ARCHIVED']),
});

// ==========================================
// 6. Chart of Accounts Schemas
// ==========================================
export const AccountTypes = [
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'REVENUE',
  'COGS',
  'OPERATING_EXPENSE',
  'OTHER_INCOME',
  'OTHER_EXPENSE',
  'TAX',
] as const;

export const createAccountSchema = z.object({
  code: z
    .string()
    .min(2, 'Account code must be at least 2 characters')
    .max(30)
    .regex(/^[A-Za-z0-9-_.]+$/, 'Account code can only contain letters, numbers, hyphens, periods')
    .toUpperCase()
    .trim(),
  name: z.string().min(2, 'Account name must be at least 2 characters').max(150).trim(),
  accountType: z.enum(AccountTypes),
  parentAccountId: z.string().optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  normalBalance: z.enum(['DEBIT', 'CREDIT']),
  currency: z.string().length(3).toUpperCase().default('USD'),
  isActive: z.boolean().default(true),
});

export const updateAccountSchema = createAccountSchema.partial().omit({ code: true });

// ==========================================
// 7. Fiscal Calendar Schemas
// ==========================================
export const createFiscalCalendarSchema = z.object({
  name: z.string().min(2, 'Calendar name must be at least 2 characters').max(100).trim(),
  fiscalYearStartMonth: z.number().int().min(1).max(12, 'Fiscal year start month must be 1 to 12'),
  startYear: z.number().int().min(2020).max(2050, 'Start year must be between 2020 and 2050'),
  calendarType: z.enum(['MONTHLY']).default('MONTHLY'),
});

export const updateFiscalPeriodStatusSchema = z.object({
  status: z.enum(['OPEN', 'CLOSED', 'LOCKED']),
});
