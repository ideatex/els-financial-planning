import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { getAssumptions, createAssumption } from '@/server/services/assumption.service';

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

  const assumptions = await getAssumptions(context.organization.id, {
    planVersionId,
    planningCycleId: searchParams.get('planningCycleId') || undefined,
    category: searchParams.get('category') || undefined,
    plantId: searchParams.get('plantId') || undefined,
    productId: searchParams.get('productId') || undefined,
    search: searchParams.get('search') || undefined,
    status: searchParams.get('status') || undefined,
  });

  return NextResponse.json({ assumptions });
});

export const POST = createApiHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.ASSUMPTIONS_MANAGE, token);

  const body = await req.json();
  const created = await createAssumption(context.organization.id, context.user.id, body);

  return NextResponse.json(created, { status: 201 });
});
