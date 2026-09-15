import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission, COOKIE_NAME } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { createRoutingVersion } from '@/server/services/routing.service';

export const dynamic = 'force-dynamic';

export const POST = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const routingId = Array.isArray(params.routingId) ? params.routingId[0] : params.routingId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.MASTER_DATA_MANAGE, token);

    const body = await req.json();
    const version = await createRoutingVersion(context.organization.id, context.user.id, routingId, body);
    return NextResponse.json({ version }, { status: 201 });
  }
);
