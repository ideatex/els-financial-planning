import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import {
  getTargetById,
  updateTarget,
  deleteTarget,
} from '@/server/services/management-target.service';

export const GET = createApiHandler(async (req: NextRequest, { params }) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.PLAN_INPUTS_VIEW, token);

  const targetId = params.targetId as string;
  const target = await getTargetById(context.organization.id, targetId);

  return NextResponse.json(target);
});

export const PATCH = createApiHandler(async (req: NextRequest, { params }) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.TARGETS_MANAGE, token);

  const targetId = params.targetId as string;
  const body = await req.json();
  const updated = await updateTarget(context.organization.id, context.user.id, targetId, body);

  return NextResponse.json(updated);
});

export const DELETE = createApiHandler(async (req: NextRequest, { params }) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.TARGETS_MANAGE, token);

  const targetId = params.targetId as string;
  const result = await deleteTarget(context.organization.id, context.user.id, targetId);

  return NextResponse.json(result);
});
