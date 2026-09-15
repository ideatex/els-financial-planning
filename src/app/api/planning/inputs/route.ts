import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { getPlanInputs, upsertPlanInput } from '@/server/services/plan-input.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.PLAN_INPUTS_VIEW, token);

  const { searchParams } = new URL(req.url);
  const planVersionId = searchParams.get('planVersionId');

  if (!planVersionId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Query parameter planVersionId is required' } },
      { status: 400 }
    );
  }

  const inputs = await getPlanInputs(context.organization.id, {
    planVersionId,
    planningCycleId: searchParams.get('planningCycleId') || undefined,
    inputCategory: searchParams.get('inputCategory') || undefined,
    fiscalPeriodId: searchParams.get('fiscalPeriodId') || undefined,
    plantId: searchParams.get('plantId') || undefined,
    productId: searchParams.get('productId') || undefined,
    materialId: searchParams.get('materialId') || undefined,
    accountId: searchParams.get('accountId') || undefined,
    status: searchParams.get('status') || undefined,
  });

  return NextResponse.json({ inputs });
});

export const POST = createApiHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.PLAN_INPUTS_EDIT, token);

  const body = await req.json();
  const saved = await upsertPlanInput(context.organization.id, context.user.id, body);

  return NextResponse.json(saved);
});
