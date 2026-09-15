import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { getPlanDriverValues, setPlanDriverValue } from '@/server/services/driver.service';

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

  const values = await getPlanDriverValues(context.organization.id, {
    planVersionId,
    driverId: searchParams.get('driverId') || undefined,
    fiscalPeriodId: searchParams.get('fiscalPeriodId') || undefined,
    plantId: searchParams.get('plantId') || undefined,
    productId: searchParams.get('productId') || undefined,
  });

  return NextResponse.json({ values });
});

export const POST = createApiHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.DRIVERS_MANAGE, token);

  const body = await req.json();
  const saved = await setPlanDriverValue(context.organization.id, context.user.id, body);

  return NextResponse.json(saved);
});
