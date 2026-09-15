import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission, COOKIE_NAME } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { getRoutingHeaderById, deleteRoutingHeader } from '@/server/services/routing.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const routingId = Array.isArray(params.routingId) ? params.routingId[0] : params.routingId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.MASTER_DATA_VIEW, token);

    const routing = await getRoutingHeaderById(context.organization.id, routingId);
    return NextResponse.json({ routing });
  }
);

export const DELETE = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const routingId = Array.isArray(params.routingId) ? params.routingId[0] : params.routingId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.MASTER_DATA_MANAGE, token);

    const result = await deleteRoutingHeader(context.organization.id, context.user.id, routingId);
    return NextResponse.json(result);
  }
);
