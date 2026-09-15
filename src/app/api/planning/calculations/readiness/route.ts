import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { checkReadiness } from '@/server/services/calculation.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.PLAN_VIEW, token);

  const { searchParams } = new URL(req.url);
  const planningCycleId = searchParams.get('planningCycleId');
  const planVersionId = searchParams.get('planVersionId');
  const fiscalPeriodId = searchParams.get('fiscalPeriodId');
  const plantId = searchParams.get('plantId');
  const productId = searchParams.get('productId');

  if (!planningCycleId || !planVersionId || !fiscalPeriodId || !plantId || !productId) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Required query parameters: planningCycleId, planVersionId, fiscalPeriodId, plantId, productId',
        },
      },
      { status: 400 }
    );
  }

  const result = await checkReadiness(context.organization.id, {
    planningCycleId,
    planVersionId,
    fiscalPeriodId,
    plantId,
    productId,
  });

  return NextResponse.json(result);
});
