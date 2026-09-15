import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import {
  applyWhatIfDelta,
  getScenarioDeltas,
  removeScenarioDelta,
} from '@/server/services/scenario.service';
import { BadRequestError } from '@/core/errors/AppError';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest, { params }) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.FORECAST_VIEW, token);
  const id = params.id as string;

  const deltas = await getScenarioDeltas(context.organization.id, id);
  return NextResponse.json(deltas);
});

export const POST = createApiHandler(async (req: NextRequest, { params }) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.WHAT_IF_EXECUTE, token);
  const id = params.id as string;

  const body = await req.json();
  const delta = await applyWhatIfDelta(context.organization.id, context.user.id, id, body);
  return NextResponse.json(delta, { status: 201 });
});

export const DELETE = createApiHandler(async (req: NextRequest, { params }) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.WHAT_IF_EXECUTE, token);
  const id = params.id as string;

  const { searchParams } = new URL(req.url);
  const deltaId = searchParams.get('deltaId');
  if (!deltaId) throw new BadRequestError('deltaId query parameter is required.');

  const res = await removeScenarioDelta(context.organization.id, context.user.id, id, deltaId);
  return NextResponse.json(res);
});
