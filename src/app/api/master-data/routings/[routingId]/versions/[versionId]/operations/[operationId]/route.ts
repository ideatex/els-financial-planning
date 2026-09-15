import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission, COOKIE_NAME } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { deleteRoutingOperation } from '@/server/services/routing.service';

export const dynamic = 'force-dynamic';

export const DELETE = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const operationId = Array.isArray(params.operationId) ? params.operationId[0] : params.operationId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.MASTER_DATA_MANAGE, token);

    const result = await deleteRoutingOperation(context.organization.id, context.user.id, operationId);
    return NextResponse.json(result);
  }
);
