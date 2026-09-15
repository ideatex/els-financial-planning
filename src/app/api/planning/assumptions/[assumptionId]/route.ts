import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import {
  getAssumptionById,
  updateAssumption,
  deleteAssumption,
} from '@/server/services/assumption.service';

export const GET = createApiHandler(async (req: NextRequest, { params }) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.PLAN_INPUTS_VIEW, token);

  const assumptionId = params.assumptionId as string;
  const assumption = await getAssumptionById(context.organization.id, assumptionId);

  return NextResponse.json(assumption);
});

export const PATCH = createApiHandler(async (req: NextRequest, { params }) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.ASSUMPTIONS_MANAGE, token);

  const assumptionId = params.assumptionId as string;
  const body = await req.json();
  const updated = await updateAssumption(context.organization.id, context.user.id, assumptionId, body);

  return NextResponse.json(updated);
});

export const DELETE = createApiHandler(async (req: NextRequest, { params }) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.ASSUMPTIONS_MANAGE, token);

  const assumptionId = params.assumptionId as string;
  const result = await deleteAssumption(context.organization.id, context.user.id, assumptionId);

  return NextResponse.json(result);
});
