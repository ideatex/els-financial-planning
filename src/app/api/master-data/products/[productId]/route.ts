import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission, COOKIE_NAME } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { getProductById, updateProduct, deleteProduct } from '@/server/services/product.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const productId = Array.isArray(params.productId) ? params.productId[0] : params.productId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.MASTER_DATA_VIEW, token);

    const product = await getProductById(context.organization.id, productId);
    return NextResponse.json({ product });
  }
);

export const PUT = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const productId = Array.isArray(params.productId) ? params.productId[0] : params.productId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.MASTER_DATA_MANAGE, token);

    const body = await req.json();
    const product = await updateProduct(context.organization.id, context.user.id, productId, body);
    return NextResponse.json({ product });
  }
);

export const DELETE = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const productId = Array.isArray(params.productId) ? params.productId[0] : params.productId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.MASTER_DATA_MANAGE, token);

    const result = await deleteProduct(context.organization.id, context.user.id, productId);
    return NextResponse.json(result);
  }
);
