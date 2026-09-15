import { db } from '@/lib/db';
import { recordAuditLog } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/core/errors/AppError';
import {
  createDriverSchema,
  updateDriverSchema,
  setPlanDriverValueSchema,
} from '@/lib/validations/drivers';
import { z } from 'zod';

export interface DriverFilters {
  category?: string;
  isActive?: boolean;
  search?: string;
}

export async function getDrivers(orgId: string, filters?: DriverFilters) {
  const where: Record<string, unknown> = { organizationId: orgId };

  if (filters?.category) where.driverCategory = filters.category;
  if (filters?.isActive !== undefined) where.isActive = filters.isActive;

  if (filters?.search) {
    where.OR = [
      { driverName: { contains: filters.search } },
      { driverCode: { contains: filters.search } },
      { description: { contains: filters.search } },
    ];
  }

  return db.driver.findMany({
    where,
    orderBy: [{ driverCategory: 'asc' }, { driverCode: 'asc' }],
    include: {
      createdByUser: { select: { id: true, name: true, email: true } },
      _count: {
        select: { planValues: true, planInputs: true },
      },
    },
  });
}

export async function getDriverById(orgId: string, driverId: string) {
  const driver = await db.driver.findFirst({
    where: { id: driverId, organizationId: orgId },
    include: {
      createdByUser: { select: { id: true, name: true, email: true } },
    },
  });

  if (!driver) {
    throw new NotFoundError(`Driver '${driverId}' not found`);
  }

  return driver;
}

export async function createDriver(
  orgId: string,
  userId: string,
  data: z.input<typeof createDriverSchema>
) {
  const validated = createDriverSchema.parse(data);

  // Check code uniqueness per org
  const existingCode = await db.driver.findUnique({
    where: {
      organizationId_driverCode: {
        organizationId: orgId,
        driverCode: validated.driverCode,
      },
    },
  });

  if (existingCode) {
    throw new ConflictError(`Driver code '${validated.driverCode}' already exists in this organization`);
  }

  const created = await db.driver.create({
    data: {
      organizationId: orgId,
      driverCode: validated.driverCode,
      driverName: validated.driverName,
      description: validated.description,
      driverCategory: validated.driverCategory,
      driverType: validated.driverType,
      unitOfMeasure: validated.unitOfMeasure,
      currency: validated.currency || 'USD',
      defaultValue: validated.defaultValue,
      isActive: validated.isActive,
      effectiveFrom: validated.effectiveFrom ? new Date(validated.effectiveFrom) : null,
      effectiveTo: validated.effectiveTo ? new Date(validated.effectiveTo) : null,
      createdById: userId,
      updatedById: userId,
    },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'DRIVER_CREATED',
    entityType: 'Driver',
    entityId: created.id,
    metadata: {
      code: created.driverCode,
      name: created.driverName,
      category: created.driverCategory,
      defaultValue: created.defaultValue,
    },
  });

  return created;
}

export async function updateDriver(
  orgId: string,
  userId: string,
  driverId: string,
  data: z.input<typeof updateDriverSchema>
) {
  const existing = await getDriverById(orgId, driverId);
  const validated = updateDriverSchema.parse(data);

  const updated = await db.driver.update({
    where: { id: driverId },
    data: {
      ...validated,
      effectiveFrom: validated.effectiveFrom !== undefined
        ? (validated.effectiveFrom ? new Date(validated.effectiveFrom) : null)
        : undefined,
      effectiveTo: validated.effectiveTo !== undefined
        ? (validated.effectiveTo ? new Date(validated.effectiveTo) : null)
        : undefined,
      updatedById: userId,
    },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'DRIVER_UPDATED',
    entityType: 'Driver',
    entityId: driverId,
    metadata: { code: existing.driverCode, changes: validated },
  });

  return updated;
}

export async function deleteDriver(orgId: string, userId: string, driverId: string) {
  const existing = await getDriverById(orgId, driverId);

  const planValueCount = await db.planDriverValue.count({ where: { driverId } });
  if (planValueCount > 0) {
    throw new ValidationError(
      `Cannot delete driver '${existing.driverCode}' because it is linked to ${planValueCount} plan version value(s)`
    );
  }

  const planInputCount = await db.planInput.count({ where: { driverId } });
  if (planInputCount > 0) {
    throw new ValidationError(
      `Cannot delete driver '${existing.driverCode}' because it is linked to ${planInputCount} plan input(s)`
    );
  }

  await db.driver.delete({ where: { id: driverId } });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'DRIVER_DELETED',
    entityType: 'Driver',
    entityId: driverId,
    metadata: { code: existing.driverCode, name: existing.driverName },
  });

  return { success: true };
}

// ==========================================
// Plan-Version Driver Values
// ==========================================

export interface PlanDriverValueFilters {
  planVersionId: string;
  driverId?: string;
  fiscalPeriodId?: string;
  plantId?: string;
  productId?: string;
}

export async function getPlanDriverValues(orgId: string, filters: PlanDriverValueFilters) {
  const where: Record<string, unknown> = {
    organizationId: orgId,
    planVersionId: filters.planVersionId,
  };

  if (filters.driverId) where.driverId = filters.driverId;
  if (filters.fiscalPeriodId) where.fiscalPeriodId = filters.fiscalPeriodId;
  if (filters.plantId) where.plantId = filters.plantId;
  if (filters.productId) where.productId = filters.productId;

  return db.planDriverValue.findMany({
    where,
    include: {
      driver: true,
      fiscalPeriod: { select: { id: true, periodName: true, periodNumber: true } },
      plant: { select: { id: true, code: true, name: true } },
      product: { select: { id: true, code: true, name: true } },
      createdByUser: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ driver: { driverCategory: 'asc' } }, { driver: { driverCode: 'asc' } }],
  });
}

export async function setPlanDriverValue(
  orgId: string,
  userId: string,
  data: z.input<typeof setPlanDriverValueSchema>
) {
  const validated = setPlanDriverValueSchema.parse(data);

  // Check version editability
  const version = await db.planVersion.findFirst({
    where: { id: validated.planVersionId, organizationId: orgId },
  });

  if (!version) {
    throw new NotFoundError(`Plan version '${validated.planVersionId}' not found`);
  }

  if (version.status === 'APPROVED' || version.status === 'LOCKED') {
    throw new ValidationError(
      `Cannot modify driver values for an ${version.status.toLowerCase()} plan version due to financial audit immutability`
    );
  }

  // Ensure driver exists
  const driver = await db.driver.findFirst({
    where: { id: validated.driverId, organizationId: orgId },
  });
  if (!driver) {
    throw new NotFoundError(`Driver '${validated.driverId}' not found`);
  }

  // Find existing plan driver value for this grain
  const existing = await db.planDriverValue.findFirst({
    where: {
      organizationId: orgId,
      planVersionId: validated.planVersionId,
      driverId: validated.driverId,
      fiscalPeriodId: validated.fiscalPeriodId || null,
      plantId: validated.plantId || null,
      productId: validated.productId || null,
    },
  });

  let saved;
  if (existing) {
    saved = await db.planDriverValue.update({
      where: { id: existing.id },
      data: {
        driverValue: validated.driverValue,
        isOverridden: validated.isOverridden,
        overrideReason: validated.overrideReason || null,
        status: validated.status,
        notes: validated.notes || null,
        updatedById: userId,
      },
      include: { driver: true, fiscalPeriod: true, plant: true, product: true },
    });
  } else {
    saved = await db.planDriverValue.create({
      data: {
        organizationId: orgId,
        planVersionId: validated.planVersionId,
        driverId: validated.driverId,
        fiscalPeriodId: validated.fiscalPeriodId || null,
        plantId: validated.plantId || null,
        productId: validated.productId || null,
        driverValue: validated.driverValue,
        isOverridden: validated.isOverridden,
        overrideReason: validated.overrideReason || null,
        status: validated.status,
        notes: validated.notes || null,
        createdById: userId,
        updatedById: userId,
      },
      include: { driver: true, fiscalPeriod: true, plant: true, product: true },
    });
  }

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: validated.isOverridden ? 'DRIVER_VALUE_OVERRIDDEN' : 'DRIVER_VALUE_SET',
    entityType: 'PlanDriverValue',
    entityId: saved.id,
    metadata: {
      driverCode: driver.driverCode,
      value: saved.driverValue,
      versionId: saved.planVersionId,
      isOverridden: saved.isOverridden,
      overrideReason: saved.overrideReason || null,
    },
  });

  return saved;
}
