import { db } from '@/lib/db';
import { recordAuditLog } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/core/errors/AppError';
import { createMaterialSchema, updateMaterialSchema } from '@/lib/validations/master-data';
import { z } from 'zod';

export async function getMaterials(
  orgId: string,
  filters?: { search?: string; category?: string; isActive?: boolean }
) {
  const where: Record<string, unknown> = { organizationId: orgId };

  if (filters?.isActive !== undefined) {
    where.isActive = filters.isActive;
  }
  if (filters?.category) {
    where.category = filters.category;
  }
  if (filters?.search) {
    const q = filters.search.trim();
    where.OR = [
      { code: { contains: q } },
      { name: { contains: q } },
      { category: { contains: q } },
    ];
  }

  return db.material.findMany({
    where,
    orderBy: { code: 'asc' },
    include: {
      _count: { select: { bomLines: true } },
    },
  });
}

export async function getMaterialById(orgId: string, materialId: string) {
  const material = await db.material.findFirst({
    where: { id: materialId, organizationId: orgId },
    include: {
      _count: { select: { bomLines: true } },
    },
  });

  if (!material) {
    throw new NotFoundError(`Material with ID '${materialId}' not found`);
  }

  return material;
}

export async function createMaterial(
  orgId: string,
  userId: string,
  data: z.infer<typeof createMaterialSchema>
) {
  const validated = createMaterialSchema.parse(data);

  const existing = await db.material.findUnique({
    where: {
      organizationId_code: {
        organizationId: orgId,
        code: validated.code,
      },
    },
  });

  if (existing) {
    throw new ConflictError(`Material code '${validated.code}' already exists in this organization`);
  }

  const material = await db.material.create({
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
    action: 'MATERIAL_CREATED',
    entityType: 'MATERIAL',
    entityId: material.id,
    metadata: { code: material.code, name: material.name, defaultCostCents: material.defaultCostCents },
  });

  return material;
}

export async function updateMaterial(
  orgId: string,
  userId: string,
  materialId: string,
  data: z.infer<typeof updateMaterialSchema>
) {
  const validated = updateMaterialSchema.parse(data);
  const existing = await getMaterialById(orgId, materialId);

  const updated = await db.material.update({
    where: { id: existing.id },
    data: {
      ...validated,
      updatedById: userId,
    },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'MATERIAL_UPDATED',
    entityType: 'MATERIAL',
    entityId: updated.id,
    metadata: { code: updated.code, changes: validated },
  });

  return updated;
}

export async function toggleMaterialStatus(
  orgId: string,
  userId: string,
  materialId: string,
  isActive: boolean
) {
  const existing = await getMaterialById(orgId, materialId);

  const updated = await db.material.update({
    where: { id: existing.id },
    data: {
      isActive,
      updatedById: userId,
    },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: isActive ? 'MATERIAL_ACTIVATED' : 'MATERIAL_DEACTIVATED',
    entityType: 'MATERIAL',
    entityId: updated.id,
    metadata: { code: updated.code, isActive },
  });

  return updated;
}

export async function deleteMaterial(orgId: string, userId: string, materialId: string) {
  const existing = await getMaterialById(orgId, materialId);

  if (existing._count && existing._count.bomLines > 0) {
    throw new ValidationError(`Cannot delete material '${existing.code}' because it is used in ${existing._count.bomLines} BOM line(s)`);
  }

  await db.material.delete({ where: { id: materialId } });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'MATERIAL_DELETED',
    entityType: 'MATERIAL',
    entityId: materialId,
    metadata: { code: existing.code, name: existing.name },
  });

  return { success: true };
}
