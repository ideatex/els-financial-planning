import { db } from '@/lib/db';
import { recordAuditLog } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/core/errors/AppError';
import { createProductSchema, updateProductSchema } from '@/lib/validations/master-data';
import { z } from 'zod';

export async function getProducts(
  orgId: string,
  filters?: { search?: string; category?: string; type?: string; productType?: string; plantId?: string; isActive?: boolean }
) {
  const where: Record<string, unknown> = { organizationId: orgId };

  if (filters?.isActive !== undefined) {
    where.isActive = filters.isActive;
  }
  if (filters?.category) {
    where.category = filters.category;
  }
  const pType = filters?.productType || filters?.type;
  if (pType) {
    where.productType = pType;
  }
  if (filters?.plantId) {
    where.defaultPlantId = filters.plantId;
  }
  if (filters?.search) {
    const q = filters.search.trim();
    where.OR = [
      { code: { contains: q } },
      { name: { contains: q } },
      { category: { contains: q } },
    ];
  }

  return db.product.findMany({
    where,
    orderBy: { code: 'asc' },
    include: {
      defaultPlant: { select: { id: true, code: true, name: true } },
      _count: { select: { bomHeaders: true, routingHeaders: true } },
    },
  });
}

export async function getProductById(orgId: string, productId: string) {
  const product = await db.product.findFirst({
    where: { id: productId, organizationId: orgId },
    include: {
      defaultPlant: true,
      bomHeaders: {
        include: {
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 1,
          },
        },
      },
      routingHeaders: {
        include: {
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 1,
          },
        },
      },
    },
  });

  if (!product) {
    throw new NotFoundError(`Product with ID '${productId}' not found`);
  }

  return product;
}

export async function createProduct(
  orgId: string,
  userId: string,
  data: z.infer<typeof createProductSchema>
) {
  const validated = createProductSchema.parse(data);

  const existing = await db.product.findUnique({
    where: {
      organizationId_code: {
        organizationId: orgId,
        code: validated.code,
      },
    },
  });

  if (existing) {
    throw new ConflictError(`Product SKU '${validated.code}' already exists in this organization`);
  }

  if (validated.defaultPlantId) {
    const plant = await db.plant.findFirst({
      where: { id: validated.defaultPlantId, organizationId: orgId },
    });
    if (!plant) {
      throw new NotFoundError('Selected default plant does not exist in this organization');
    }
  }

  const product = await db.product.create({
    data: {
      ...validated,
      organizationId: orgId,
      effectiveFrom: validated.effectiveFrom ? new Date(validated.effectiveFrom) : null,
      effectiveTo: validated.effectiveTo ? new Date(validated.effectiveTo) : null,
      createdById: userId,
      updatedById: userId,
    },
    include: { defaultPlant: true },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'PRODUCT_CREATED',
    entityType: 'PRODUCT',
    entityId: product.id,
    metadata: { code: product.code, name: product.name, priceCents: product.standardPriceCents },
  });

  return product;
}

export async function updateProduct(
  orgId: string,
  userId: string,
  productId: string,
  data: z.infer<typeof updateProductSchema>
) {
  const validated = updateProductSchema.parse(data);
  const existing = await getProductById(orgId, productId);

  if (validated.defaultPlantId) {
    const plant = await db.plant.findFirst({
      where: { id: validated.defaultPlantId, organizationId: orgId },
    });
    if (!plant) {
      throw new NotFoundError('Selected default plant does not exist in this organization');
    }
  }

  const updated = await db.product.update({
    where: { id: existing.id },
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
    include: { defaultPlant: true },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'PRODUCT_UPDATED',
    entityType: 'PRODUCT',
    entityId: updated.id,
    metadata: { code: updated.code, changes: validated },
  });

  return updated;
}

export async function toggleProductStatus(
  orgId: string,
  userId: string,
  productId: string,
  isActive: boolean
) {
  const existing = await getProductById(orgId, productId);

  const updated = await db.product.update({
    where: { id: existing.id },
    data: {
      isActive,
      updatedById: userId,
    },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: isActive ? 'PRODUCT_ACTIVATED' : 'PRODUCT_DEACTIVATED',
    entityType: 'PRODUCT',
    entityId: updated.id,
    metadata: { code: updated.code, isActive },
  });

  return updated;
}

export async function deleteProduct(orgId: string, userId: string, productId: string) {
  const existing = await getProductById(orgId, productId);

  if (existing.bomHeaders && existing.bomHeaders.length > 0) {
    throw new ValidationError(`Cannot delete product '${existing.code}' because BOMs are associated with it`);
  }
  if (existing.routingHeaders && existing.routingHeaders.length > 0) {
    throw new ValidationError(`Cannot delete product '${existing.code}' because Routings are associated with it`);
  }

  // Check if used as a BOM line component elsewhere
  const bomLineUsage = await db.bomLine.count({
    where: { componentProductId: productId },
  });
  if (bomLineUsage > 0) {
    throw new ValidationError(`Cannot delete product '${existing.code}' because it is used as a subassembly component in existing BOMs`);
  }

  await db.product.delete({ where: { id: productId } });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'PRODUCT_DELETED',
    entityType: 'PRODUCT',
    entityId: productId,
    metadata: { code: existing.code, name: existing.name },
  });

  return { success: true };
}
