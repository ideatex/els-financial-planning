import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission, COOKIE_NAME } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { createBomVersion } from '@/server/services/bom.service';

export const dynamic = 'force-dynamic';

export const POST = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const bomId = Array.isArray(params.bomId) ? params.bomId[0] : params.bomId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.MASTER_DATA_MANAGE, token);

    const body = await req.json();
    const version = await createBomVersion(context.organization.id, context.user.id, bomId, body);
    return NextResponse.json({ version }, { status: 201 });
  }
);
