import { db } from '@/lib/db';
import { recordAuditLog } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError, ForbiddenError } from '@/core/errors/AppError';
import {
  createBomHeaderSchema,
  createBomVersionSchema,
  addBomLineSchema,
} from '@/lib/validations/master-data';
import { z } from 'zod';

export async function getBoms(
  orgId: string,
  filters?: { productId?: string; search?: string }
) {
  const where: Record<string, unknown> = { organizationId: orgId };

  if (filters?.productId) {
    where.productId = filters.productId;
  }
  if (filters?.search) {
    const q = filters.search.trim();
    where.OR = [
      { name: { contains: q } },
      { product: { code: { contains: q } } },
      { product: { name: { contains: q } } },
    ];
  }

  return db.bomHeader.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      product: { select: { id: true, code: true, name: true, unitOfMeasure: true } },
      versions: {
        orderBy: { versionNumber: 'desc' },
        include: {
          _count: { select: { lines: true } },
        },
      },
    },
  });
}

export async function getBomById(orgId: string, bomId: string) {
  const bom = await db.bomHeader.findFirst({
    where: { id: bomId, organizationId: orgId },
    include: {
      product: true,
      versions: {
        orderBy: { versionNumber: 'desc' },
        include: {
          lines: {
            include: {
              material: true,
              componentProduct: true,
            },
          },
        },
      },
    },
  });

  if (!bom) {
    throw new NotFoundError(`BOM with ID '${bomId}' not found`);
  }

  return bom;
}

export async function createBomHeader(
  orgId: string,
  userId: string,
  data: z.infer<typeof createBomHeaderSchema>
) {
  const validated = createBomHeaderSchema.parse(data);

  // Verify product belongs to org
  const product = await db.product.findFirst({
    where: { id: validated.productId, organizationId: orgId },
  });
  if (!product) {
    throw new NotFoundError('Selected product does not exist in this organization');
  }

  const existing = await db.bomHeader.findUnique({
    where: {
      organizationId_productId_name: {
        organizationId: orgId,
        productId: validated.productId,
        name: validated.name,
      },
    },
  });

  if (existing) {
    throw new ConflictError(`BOM '${validated.name}' already exists for product '${product.code}'`);
  }

  // Transaction to create Header and initial Version 1
  const result = await db.$transaction(async (tx) => {
    const header = await tx.bomHeader.create({
      data: {
        ...validated,
        organizationId: orgId,
        createdById: userId,
        updatedById: userId,
      },
    });

    const version = await tx.bomVersion.create({
      data: {
        bomHeaderId: header.id,
        versionNumber: 1,
        status: 'DRAFT',
        createdById: userId,
        updatedById: userId,
      },
    });

    return { header, version };
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'BOM_CREATED',
    entityType: 'BOM',
    entityId: result.header.id,
    metadata: { productId: product.id, productSku: product.code, bomName: result.header.name },
  });

  return result.header;
}

export async function createBomVersion(
  orgId: string,
  userId: string,
  bomId: string,
  data: z.infer<typeof createBomVersionSchema>
) {
  const validated = createBomVersionSchema.parse(data);
  const header = await getBomById(orgId, bomId);

  const existingVersion = await db.bomVersion.findUnique({
    where: {
      bomHeaderId_versionNumber: {
        bomHeaderId: header.id,
        versionNumber: validated.versionNumber,
      },
    },
  });

  if (existingVersion) {
    throw new ConflictError(`Version ${validated.versionNumber} already exists for this BOM`);
  }

  const version = await db.bomVersion.create({
    data: {
      bomHeaderId: header.id,
      versionNumber: validated.versionNumber,
      status: 'DRAFT',
      effectiveFrom: validated.effectiveFrom ? new Date(validated.effectiveFrom) : null,
      effectiveTo: validated.effectiveTo ? new Date(validated.effectiveTo) : null,
      createdById: userId,
      updatedById: userId,
    },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'BOM_VERSION_CREATED',
    entityType: 'BOM_VERSION',
    entityId: version.id,
    metadata: { bomId: header.id, versionNumber: version.versionNumber },
  });

  return version;
}

/**
 * Checks if adding `candidateChildProductId` to a BOM for `parentProductId` creates a circular reference.
 */
async function checkCircularBomReference(
  parentProductId: string,
  candidateChildProductId: string,
  visited = new Set<string>()
): Promise<boolean> {
  if (parentProductId === candidateChildProductId) {
    return true; // Direct circular reference
  }
  if (visited.has(candidateChildProductId)) {
    return false;
  }
  visited.add(candidateChildProductId);

  // Find all component products used in candidateChildProductId's BOMs
  const childBoms = await db.bomHeader.findMany({
    where: { productId: candidateChildProductId },
    include: {
      versions: {
        where: { status: { in: ['APPROVED', 'DRAFT'] } },
        include: {
          lines: {
            where: { componentType: 'PRODUCT' },
            select: { componentProductId: true },
          },
        },
      },
    },
  });

  for (const bom of childBoms) {
    for (const v of bom.versions) {
      for (const line of v.lines) {
        if (line.componentProductId) {
          if (line.componentProductId === parentProductId) {
            return true;
          }
          const hasCycle = await checkCircularBomReference(
            parentProductId,
            line.componentProductId,
            visited
          );
          if (hasCycle) return true;
        }
      }
    }
  }

  return false;
}

export async function addBomLine(
  orgId: string,
  userId: string,
  bomVersionId: string,
  data: z.input<typeof addBomLineSchema>
) {
  const validated = addBomLineSchema.parse(data);

  const version = await db.bomVersion.findUnique({
    where: { id: bomVersionId },
    include: { bomHeader: true, lines: true },
  });

  if (!version || version.bomHeader.organizationId !== orgId) {
    throw new NotFoundError('BOM version not found');
  }

  if (version.status === 'APPROVED' || version.status === 'ARCHIVED') {
    throw new ValidationError(`Cannot modify BOM version with status '${version.status}'. Only DRAFT or IN_REVIEW versions can be edited.`);
  }

  // Prevent duplicate components in the same version
  const duplicate = version.lines.find((line) => {
    if (validated.componentType === 'MATERIAL') {
      return line.componentType === 'MATERIAL' && line.materialId === validated.materialId;
    }
    return line.componentType === 'PRODUCT' && line.componentProductId === validated.componentProductId;
  });

  if (duplicate) {
    throw new ConflictError('Component already exists in this BOM version');
  }

  // Circular reference validation for sub-assembly products
  if (validated.componentType === 'PRODUCT' && validated.componentProductId) {
    const isCircular = await checkCircularBomReference(
      version.bomHeader.productId,
      validated.componentProductId
    );

    if (isCircular) {
      throw new ValidationError(
        'Circular reference detected: Adding this sub-assembly component would create a recursive loop.'
      );
    }
  }

  const line = await db.bomLine.create({
    data: {
      bomVersionId: version.id,
      componentType: validated.componentType,
      materialId: validated.componentType === 'MATERIAL' ? validated.materialId : null,
      componentProductId: validated.componentType === 'PRODUCT' ? validated.componentProductId : null,
      quantityPerUnit: validated.quantityPerUnit,
      unitOfMeasure: validated.unitOfMeasure,
      scrapPercentage: validated.scrapPercentage,
      createdById: userId,
    },
    include: {
      material: true,
      componentProduct: true,
    },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'BOM_LINE_ADDED',
    entityType: 'BOM_LINE',
    entityId: line.id,
    metadata: { bomVersionId: version.id, componentType: validated.componentType },
  });

  return line;
}

export async function removeBomLine(
  orgId: string,
  userId: string,
  lineId: string
) {
  const line = await db.bomLine.findUnique({
    where: { id: lineId },
    include: {
      bomVersion: {
        include: { bomHeader: true },
      },
    },
  });

  if (!line || line.bomVersion.bomHeader.organizationId !== orgId) {
    throw new NotFoundError('BOM line not found');
  }

  if (line.bomVersion.status === 'APPROVED' || line.bomVersion.status === 'ARCHIVED') {
    throw new ValidationError(`Cannot delete line from a BOM version with status '${line.bomVersion.status}'`);
  }

  await db.bomLine.delete({
    where: { id: lineId },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'BOM_LINE_REMOVED',
    entityType: 'BOM_LINE',
    entityId: lineId,
    metadata: { bomVersionId: line.bomVersionId },
  });

  return { success: true };
}

export async function updateBomVersionStatus(
  orgId: string,
  userId: string,
  versionId: string,
  newStatus: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'ARCHIVED'
) {
  const version = await db.bomVersion.findUnique({
    where: { id: versionId },
    include: { bomHeader: true, lines: true },
  });

  if (!version || version.bomHeader.organizationId !== orgId) {
    throw new NotFoundError('BOM version not found');
  }

  if (newStatus === 'APPROVED' && version.lines.length === 0) {
    throw new ValidationError('Cannot approve a BOM version with zero components');
  }

  const updated = await db.bomVersion.update({
    where: { id: version.id },
    data: {
      status: newStatus,
      updatedById: userId,
    },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'BOM_STATUS_UPDATED',
    entityType: 'BOM_VERSION',
    entityId: updated.id,
    metadata: { previousStatus: version.status, newStatus },
  });

  return updated;
}

export async function deleteBomHeader(orgId: string, userId: string, bomId: string) {
  const existing = await getBomById(orgId, bomId);

  const hasApproved = existing.versions.some((v) => v.status === 'APPROVED' || v.status === 'ARCHIVED');
  if (hasApproved) {
    throw new ValidationError(`Cannot delete BOM '${existing.name}' containing approved or archived versions`);
  }

  await db.bomHeader.delete({ where: { id: bomId } });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'BOM_HEADER_DELETED',
    entityType: 'BOM_HEADER',
    entityId: bomId,
    metadata: { name: existing.name, productId: existing.productId },
  });

  return { success: true };
}

export const getBomHeaders = getBoms;
export const getBomHeaderById = getBomById;
export const deleteBomLine = removeBomLine;
