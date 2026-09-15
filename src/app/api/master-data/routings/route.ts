import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission, COOKIE_NAME } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { getRoutingHeaders, createRoutingHeader } from '@/server/services/routing.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
  const context = await requirePermission(Permissions.MASTER_DATA_VIEW, token);

  const { searchParams } = new URL(req.url);
  const productId = searchParams.get('productId') || undefined;
  const plantId = searchParams.get('plantId') || undefined;
  const search = searchParams.get('search') || undefined;

  const routings = await getRoutingHeaders(context.organization.id, { productId, plantId, search });
  return NextResponse.json({ routings });
});

export const POST = createApiHandler(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
  const context = await requirePermission(Permissions.MASTER_DATA_MANAGE, token);

  const body = await req.json();
  const routing = await createRoutingHeader(context.organization.id, context.user.id, body);
  return NextResponse.json({ routing }, { status: 201 });
});
