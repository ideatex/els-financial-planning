import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission, COOKIE_NAME } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { deleteBomLine } from '@/server/services/bom.service';

export const dynamic = 'force-dynamic';

export const DELETE = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const lineId = Array.isArray(params.lineId) ? params.lineId[0] : params.lineId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.MASTER_DATA_MANAGE, token);

    const result = await deleteBomLine(context.organization.id, context.user.id, lineId);
    return NextResponse.json(result);
  }
);
