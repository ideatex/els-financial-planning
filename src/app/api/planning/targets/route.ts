import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { getTargets, createTarget } from '@/server/services/management-target.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.PLAN_INPUTS_VIEW, token);

  const { searchParams } = new URL(req.url);
  const targets = await getTargets(context.organization.id, {
    planningCycleId: searchParams.get('planningCycleId') || undefined,
    planVersionId: searchParams.get('planVersionId') || undefined,
    fiscalPeriodId: searchParams.get('fiscalPeriodId') || undefined,
    plantId: searchParams.get('plantId') || undefined,
    productId: searchParams.get('productId') || undefined,
    accountId: searchParams.get('accountId') || undefined,
    targetMetric: searchParams.get('targetMetric') || undefined,
    status: searchParams.get('status') || undefined,
  });

  return NextResponse.json({ targets });
});

export const POST = createApiHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.TARGETS_MANAGE, token);

  const body = await req.json();
  const created = await createTarget(context.organization.id, context.user.id, body);

  return NextResponse.json(created, { status: 201 });
});
