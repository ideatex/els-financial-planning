import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission, COOKIE_NAME } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { getProducts, createProduct } from '@/server/services/product.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
  const context = await requirePermission(Permissions.MASTER_DATA_VIEW, token);

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') || undefined;
  const category = searchParams.get('category') || undefined;
  const productType = searchParams.get('productType') || undefined;
  const plantId = searchParams.get('plantId') || undefined;
  const isActiveParam = searchParams.get('isActive');
  const isActive = isActiveParam !== null ? isActiveParam === 'true' : undefined;

  const products = await getProducts(context.organization.id, {
    search,
    category,
    productType,
    plantId,
    isActive,
  });

  return NextResponse.json({ products });
});

export const POST = createApiHandler(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
  const context = await requirePermission(Permissions.MASTER_DATA_MANAGE, token);

  const body = await req.json();
  const product = await createProduct(context.organization.id, context.user.id, body);
  return NextResponse.json({ product }, { status: 201 });
});
