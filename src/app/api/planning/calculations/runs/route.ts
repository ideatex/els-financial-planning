import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { getCalculationRuns } from '@/server/services/calculation.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.PLAN_VIEW, token);

  const { searchParams } = new URL(req.url);
  const runs = await getCalculationRuns(context.organization.id, {
    planningCycleId: searchParams.get('planningCycleId') || undefined,
    planVersionId: searchParams.get('planVersionId') || undefined,
    fiscalPeriodId: searchParams.get('fiscalPeriodId') || undefined,
    plantId: searchParams.get('plantId') || undefined,
    productId: searchParams.get('productId') || undefined,
    status: searchParams.get('status') || undefined,
    limit: searchParams.has('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined,
  });

  return NextResponse.json({ runs });
});
