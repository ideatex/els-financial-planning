import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission, COOKIE_NAME } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import {
  getPlanningCycleById,
  updatePlanningCycle,
  updatePlanningCycleStatus,
  deletePlanningCycle,
} from '@/server/services/planning-cycle.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const cycleId = Array.isArray(params.cycleId) ? params.cycleId[0] : params.cycleId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.PLAN_VIEW, token);

    const cycle = await getPlanningCycleById(context.organization.id, cycleId);
    return NextResponse.json({ cycle });
  }
);

export const PUT = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const cycleId = Array.isArray(params.cycleId) ? params.cycleId[0] : params.cycleId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.PLAN_CYCLE_MANAGE, token);

    const body = await req.json();
    const cycle = await updatePlanningCycle(context.organization.id, context.user.id, cycleId, body);
    return NextResponse.json({ cycle });
  }
);

export const PATCH = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const cycleId = Array.isArray(params.cycleId) ? params.cycleId[0] : params.cycleId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.PLAN_CYCLE_MANAGE, token);

    const body = await req.json();
    const cycle = await updatePlanningCycleStatus(context.organization.id, context.user.id, cycleId, body);
    return NextResponse.json({ cycle });
  }
);

export const DELETE = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const cycleId = Array.isArray(params.cycleId) ? params.cycleId[0] : params.cycleId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.PLAN_CYCLE_MANAGE, token);

    const result = await deletePlanningCycle(context.organization.id, context.user.id, cycleId);
    return NextResponse.json(result);
  }
);
