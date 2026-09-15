import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission, COOKIE_NAME } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import {
  getPlanVersionById,
  updatePlanVersion,
  updatePlanVersionStatus,
  deletePlanVersion,
} from '@/server/services/plan-version.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const versionId = Array.isArray(params.versionId) ? params.versionId[0] : params.versionId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.PLAN_VIEW, token);

    const version = await getPlanVersionById(context.organization.id, versionId);
    return NextResponse.json({ version });
  }
);

export const PUT = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const versionId = Array.isArray(params.versionId) ? params.versionId[0] : params.versionId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.PLAN_VERSION_CREATE, token);

    const body = await req.json();
    const version = await updatePlanVersion(context.organization.id, context.user.id, versionId, body);
    return NextResponse.json({ version });
  }
);

export const PATCH = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const versionId = Array.isArray(params.versionId) ? params.versionId[0] : params.versionId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const body = await req.json();

    // Contextual RBAC based on target status
    let requiredPerm: any = Permissions.PLAN_VERSION_CREATE;
    if (body.status === 'IN_REVIEW') {
      requiredPerm = Permissions.PLAN_VERSION_SUBMIT;
    } else if (body.status === 'APPROVED' || body.status === 'REJECTED') {
      requiredPerm = Permissions.PLAN_VERSION_APPROVE;
    } else if (body.status === 'LOCKED') {
      requiredPerm = Permissions.PLAN_VERSION_LOCK;
    }

    const context = await requirePermission(requiredPerm, token);
    const version = await updatePlanVersionStatus(context.organization.id, context.user.id, versionId, body);
    return NextResponse.json({ version });
  }
);

export const DELETE = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const versionId = Array.isArray(params.versionId) ? params.versionId[0] : params.versionId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.PLAN_VERSION_CREATE, token);

    const result = await deletePlanVersion(context.organization.id, context.user.id, versionId);
    return NextResponse.json(result);
  }
);
