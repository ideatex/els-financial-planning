import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission, COOKIE_NAME } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { duplicatePlanVersion } from '@/server/services/plan-version.service';

export const dynamic = 'force-dynamic';

export const POST = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const versionId = Array.isArray(params.versionId) ? params.versionId[0] : params.versionId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.PLAN_VERSION_CREATE, token);

    const body = await req.json();
    const duplicated = await duplicatePlanVersion(context.organization.id, context.user.id, versionId, body);
    return NextResponse.json({ version: duplicated }, { status: 201 });
  }
);
