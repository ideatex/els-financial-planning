import { db } from '@/lib/db';
import { recordAuditLog } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/core/errors/AppError';
import {
  createRoutingHeaderSchema,
  createRoutingVersionSchema,
  addRoutingOperationSchema,
} from '@/lib/validations/master-data';
import { z } from 'zod';

export async function getRoutings(
  orgId: string,
  filters?: { productId?: string; plantId?: string; search?: string }
) {
  const where: Record<string, unknown> = { organizationId: orgId };

  if (filters?.productId) {
    where.productId = filters.productId;
  }
  if (filters?.plantId) {
    where.plantId = filters.plantId;
  }
  if (filters?.search) {
    const q = filters.search.trim();
    where.OR = [
      { name: { contains: q } },
      { product: { code: { contains: q } } },
      { plant: { code: { contains: q } } },
    ];
  }

  return db.routingHeader.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      product: { select: { id: true, code: true, name: true } },
      plant: { select: { id: true, code: true, name: true } },
      versions: {
        orderBy: { versionNumber: 'desc' },
        include: {
          _count: { select: { operations: true } },
        },
      },
    },
  });
}

export async function getRoutingById(orgId: string, routingId: string) {
  const routing = await db.routingHeader.findFirst({
    where: { id: routingId, organizationId: orgId },
    include: {
      product: true,
      plant: true,
      versions: {
        orderBy: { versionNumber: 'desc' },
        include: {
          operations: {
            orderBy: { sequence: 'asc' },
          },
        },
      },
    },
  });

  if (!routing) {
    throw new NotFoundError(`Routing with ID '${routingId}' not found`);
  }

  return routing;
}

export async function createRoutingHeader(
  orgId: string,
  userId: string,
  data: z.infer<typeof createRoutingHeaderSchema>
) {
  const validated = createRoutingHeaderSchema.parse(data);

  // Validate product and plant belong to org
  const [product, plant] = await Promise.all([
    db.product.findFirst({ where: { id: validated.productId, organizationId: orgId } }),
    db.plant.findFirst({ where: { id: validated.plantId, organizationId: orgId } }),
  ]);

  if (!product) throw new NotFoundError('Selected product not found in this organization');
  if (!plant) throw new NotFoundError('Selected plant not found in this organization');

  const existing = await db.routingHeader.findUnique({
    where: {
      organizationId_productId_plantId_name: {
        organizationId: orgId,
        productId: validated.productId,
        plantId: validated.plantId,
        name: validated.name,
      },
    },
  });

  if (existing) {
    throw new ConflictError(`Routing '${validated.name}' already exists for product '${product.code}' at plant '${plant.code}'`);
  }

  const result = await db.$transaction(async (tx) => {
    const header = await tx.routingHeader.create({
      data: {
        ...validated,
        organizationId: orgId,
        createdById: userId,
        updatedById: userId,
      },
    });

    const version = await tx.routingVersion.create({
      data: {
        routingHeaderId: header.id,
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
    action: 'ROUTING_CREATED',
    entityType: 'ROUTING',
    entityId: result.header.id,
    metadata: { productId: product.id, plantId: plant.id, routingName: result.header.name },
  });

  return result.header;
}

export async function createRoutingVersion(
  orgId: string,
  userId: string,
  routingId: string,
  data: z.infer<typeof createRoutingVersionSchema>
) {
  const validated = createRoutingVersionSchema.parse(data);
  const header = await getRoutingById(orgId, routingId);

  const existingVersion = await db.routingVersion.findUnique({
    where: {
      routingHeaderId_versionNumber: {
        routingHeaderId: header.id,
        versionNumber: validated.versionNumber,
      },
    },
  });

  if (existingVersion) {
    throw new ConflictError(`Version ${validated.versionNumber} already exists for this Routing`);
  }

  const version = await db.routingVersion.create({
    data: {
      routingHeaderId: header.id,
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
    action: 'ROUTING_VERSION_CREATED',
    entityType: 'ROUTING_VERSION',
    entityId: version.id,
    metadata: { routingId: header.id, versionNumber: version.versionNumber },
  });

  return version;
}

export async function addRoutingOperation(
  orgId: string,
  userId: string,
  routingVersionId: string,
  data: z.input<typeof addRoutingOperationSchema>
) {
  const validated = addRoutingOperationSchema.parse(data);

  const version = await db.routingVersion.findUnique({
    where: { id: routingVersionId },
    include: { routingHeader: true },
  });

  if (!version || version.routingHeader.organizationId !== orgId) {
    throw new NotFoundError('Routing version not found');
  }

  if (version.status === 'APPROVED' || version.status === 'ARCHIVED') {
    throw new ValidationError(`Cannot modify Routing version with status '${version.status}'`);
  }

  const existingSeq = await db.routingOperation.findUnique({
    where: {
      routingVersionId_sequence: {
        routingVersionId,
        sequence: validated.sequence,
      },
    },
  });

  if (existingSeq) {
    throw new ConflictError(`Operation sequence ${validated.sequence} already exists in this routing version`);
  }

  const operation = await db.routingOperation.create({
    data: {
      routingVersionId,
      ...validated,
      createdById: userId,
    },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'ROUTING_OPERATION_ADDED',
    entityType: 'ROUTING_OPERATION',
    entityId: operation.id,
    metadata: { routingVersionId, sequence: operation.sequence, operationName: operation.operationName },
  });

  return operation;
}

export async function removeRoutingOperation(
  orgId: string,
  userId: string,
  operationId: string
) {
  const op = await db.routingOperation.findUnique({
    where: { id: operationId },
    include: {
      routingVersion: {
        include: { routingHeader: true },
      },
    },
  });

  if (!op || op.routingVersion.routingHeader.organizationId !== orgId) {
    throw new NotFoundError('Operation not found');
  }

  if (op.routingVersion.status === 'APPROVED' || op.routingVersion.status === 'ARCHIVED') {
    throw new ValidationError(`Cannot delete operation from Routing version with status '${op.routingVersion.status}'`);
  }

  await db.routingOperation.delete({
    where: { id: operationId },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'ROUTING_OPERATION_REMOVED',
    entityType: 'ROUTING_OPERATION',
    entityId: operationId,
    metadata: { routingVersionId: op.routingVersionId, sequence: op.sequence },
  });

  return { success: true };
}

export async function updateRoutingVersionStatus(
  orgId: string,
  userId: string,
  versionId: string,
  newStatus: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'ARCHIVED'
) {
  const version = await db.routingVersion.findUnique({
    where: { id: versionId },
    include: { routingHeader: true, operations: true },
  });

  if (!version || version.routingHeader.organizationId !== orgId) {
    throw new NotFoundError('Routing version not found');
  }

  if (newStatus === 'APPROVED' && version.operations.length === 0) {
    throw new ValidationError('Cannot approve a Routing version with zero operations');
  }

  const updated = await db.routingVersion.update({
    where: { id: version.id },
    data: {
      status: newStatus,
      updatedById: userId,
    },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'ROUTING_STATUS_UPDATED',
    entityType: 'ROUTING_VERSION',
    entityId: updated.id,
    metadata: { previousStatus: version.status, newStatus },
  });

  return updated;
}

export async function deleteRoutingHeader(orgId: string, userId: string, routingId: string) {
  const existing = await getRoutingById(orgId, routingId);

  const hasApproved = existing.versions.some((v) => v.status === 'APPROVED' || v.status === 'ARCHIVED');
  if (hasApproved) {
    throw new ValidationError(`Cannot delete Routing '${existing.name}' containing approved or archived versions`);
  }

  await db.routingHeader.delete({ where: { id: routingId } });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'ROUTING_HEADER_DELETED',
    entityType: 'ROUTING_HEADER',
    entityId: routingId,
    metadata: { name: existing.name, productId: existing.productId, plantId: existing.plantId },
  });

  return { success: true };
}

export const getRoutingHeaders = getRoutings;
export const getRoutingHeaderById = getRoutingById;
export const deleteRoutingOperation = removeRoutingOperation;
