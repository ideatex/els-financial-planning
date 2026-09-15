import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { executeCalculation } from '@/server/services/calculation.service';

export const dynamic = 'force-dynamic';

export const POST = createApiHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.PLAN_CALCULATE, token);

  const body = await req.json();
  const { planningCycleId, planVersionId, fiscalPeriodId, plantId, productId } = body;

  if (!planningCycleId || !planVersionId || !fiscalPeriodId || !plantId || !productId) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required parameters: planningCycleId, planVersionId, fiscalPeriodId, plantId, productId',
        },
      },
      { status: 400 }
    );
  }

  const result = await executeCalculation(context.organization.id, context.user.id, {
    planningCycleId,
    planVersionId,
    fiscalPeriodId,
    plantId,
    productId,
  });

  return NextResponse.json(result, { status: 201 });
});
