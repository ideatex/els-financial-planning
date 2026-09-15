import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission, COOKIE_NAME } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { getBomHeaders, createBomHeader } from '@/server/services/bom.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
  const context = await requirePermission(Permissions.MASTER_DATA_VIEW, token);

  const { searchParams } = new URL(req.url);
  const productId = searchParams.get('productId') || undefined;
  const search = searchParams.get('search') || undefined;

  const boms = await getBomHeaders(context.organization.id, { productId, search });
  return NextResponse.json({ boms });
});

export const POST = createApiHandler(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
  const context = await requirePermission(Permissions.MASTER_DATA_MANAGE, token);

  const body = await req.json();
  const bom = await createBomHeader(context.organization.id, context.user.id, body);
  return NextResponse.json({ bom }, { status: 201 });
});
