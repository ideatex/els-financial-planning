import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission, COOKIE_NAME } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { getBomHeaderById, deleteBomHeader } from '@/server/services/bom.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const bomId = Array.isArray(params.bomId) ? params.bomId[0] : params.bomId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.MASTER_DATA_VIEW, token);

    const bom = await getBomHeaderById(context.organization.id, bomId);
    return NextResponse.json({ bom });
  }
);

export const DELETE = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const bomId = Array.isArray(params.bomId) ? params.bomId[0] : params.bomId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.MASTER_DATA_MANAGE, token);

    const result = await deleteBomHeader(context.organization.id, context.user.id, bomId);
    return NextResponse.json(result);
  }
);
