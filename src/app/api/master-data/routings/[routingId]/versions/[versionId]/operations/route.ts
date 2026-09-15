import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission, COOKIE_NAME } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { addRoutingOperation } from '@/server/services/routing.service';

export const dynamic = 'force-dynamic';

export const POST = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const versionId = Array.isArray(params.versionId) ? params.versionId[0] : params.versionId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.MASTER_DATA_MANAGE, token);

    const body = await req.json();
    const operation = await addRoutingOperation(context.organization.id, context.user.id, versionId, body);
    return NextResponse.json({ operation }, { status: 201 });
  }
);
