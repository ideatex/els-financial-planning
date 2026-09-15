import { db } from '@/lib/db';
import { recordAuditLog } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/core/errors/AppError';
import { createPlantSchema, updatePlantSchema } from '@/lib/validations/master-data';
import { z } from 'zod';

export async function getPlants(
  orgId: string,
  filters?: { search?: string; isActive?: boolean }
) {
  const where: Record<string, unknown> = { organizationId: orgId };

  if (filters?.isActive !== undefined) {
    where.isActive = filters.isActive;
  }

  if (filters?.search) {
    const q = filters.search.trim();
    where.OR = [
      { code: { contains: q } },
      { name: { contains: q } },
      { city: { contains: q } },
    ];
  }

  return db.plant.findMany({
    where,
    orderBy: { code: 'asc' },
    include: {
      _count: {
        select: {
          products: true,
          routingHeaders: true,
        },
      },
    },
  });
}

export async function getPlantById(orgId: string, plantId: string) {
  const plant = await db.plant.findFirst({
    where: { id: plantId, organizationId: orgId },
    include: {
      _count: {
        select: {
          products: true,
          routingHeaders: true,
        },
      },
    },
  });

  if (!plant) {
    throw new NotFoundError(`Plant with ID '${plantId}' not found`);
  }

  return plant;
}

export async function createPlant(
  orgId: string,
  userId: string,
  data: z.infer<typeof createPlantSchema>
) {
  const validated = createPlantSchema.parse(data);

  const existing = await db.plant.findUnique({
    where: {
      organizationId_code: {
        organizationId: orgId,
        code: validated.code,
      },
    },
  });

  if (existing) {
    throw new ConflictError(`Plant with code '${validated.code}' already exists in this organization`);
  }

  const plant = await db.plant.create({
    data: {
      ...validated,
      organizationId: orgId,
      createdById: userId,
      updatedById: userId,
    },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'PLANT_CREATED',
    entityType: 'PLANT',
    entityId: plant.id,
    metadata: { code: plant.code, name: plant.name },
  });

  return plant;
}

export async function updatePlant(
  orgId: string,
  userId: string,
  plantId: string,
  data: z.infer<typeof updatePlantSchema>
) {
  const validated = updatePlantSchema.parse(data);
  const existing = await getPlantById(orgId, plantId);

  const updated = await db.plant.update({
    where: { id: existing.id },
    data: {
      ...validated,
      updatedById: userId,
    },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'PLANT_UPDATED',
    entityType: 'PLANT',
    entityId: updated.id,
    metadata: { code: updated.code, changes: validated },
  });

  return updated;
}

export async function togglePlantStatus(
  orgId: string,
  userId: string,
  plantId: string,
  isActive: boolean
) {
  const existing = await getPlantById(orgId, plantId);

  const updated = await db.plant.update({
    where: { id: existing.id },
    data: {
      isActive,
      updatedById: userId,
    },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: isActive ? 'PLANT_ACTIVATED' : 'PLANT_DEACTIVATED',
    entityType: 'PLANT',
    entityId: updated.id,
    metadata: { code: updated.code, isActive },
  });

  return updated;
}

export async function deletePlant(orgId: string, userId: string, plantId: string) {
  const existing = await getPlantById(orgId, plantId);

  if (existing._count && (existing._count.products > 0 || existing._count.routingHeaders > 0)) {
    throw new ValidationError(`Cannot delete plant '${existing.code}' because products or routings are associated with it`);
  }

  await db.plant.delete({ where: { id: plantId } });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'PLANT_DELETED',
    entityType: 'PLANT',
    entityId: plantId,
    metadata: { code: existing.code, name: existing.name },
  });

  return { success: true };
}
