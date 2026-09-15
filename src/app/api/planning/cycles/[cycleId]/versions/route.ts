import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission, COOKIE_NAME } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { getPlanVersions, createPlanVersion } from '@/server/services/plan-version.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const cycleId = Array.isArray(params.cycleId) ? params.cycleId[0] : params.cycleId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.PLAN_VIEW, token);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;
    const versionType = searchParams.get('versionType') || undefined;

    const versions = await getPlanVersions(context.organization.id, cycleId, { status, versionType });
    return NextResponse.json({ versions });
  }
);

export const POST = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const cycleId = Array.isArray(params.cycleId) ? params.cycleId[0] : params.cycleId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.PLAN_VERSION_CREATE, token);

    const body = await req.json();
    const version = await createPlanVersion(context.organization.id, context.user.id, cycleId, body);
    return NextResponse.json({ version }, { status: 201 });
  }
);
