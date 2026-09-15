import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { getLatestSuccessfulRun } from '@/server/services/calculation.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.PLAN_VIEW, token);

  const { searchParams } = new URL(req.url);
  const planVersionId = searchParams.get('planVersionId');

  if (!planVersionId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Query parameter planVersionId is required' } },
      { status: 400 }
    );
  }

  const run = await getLatestSuccessfulRun(context.organization.id, {
    planVersionId,
    fiscalPeriodId: searchParams.get('fiscalPeriodId') || undefined,
    plantId: searchParams.get('plantId') || undefined,
    productId: searchParams.get('productId') || undefined,
  });

  return NextResponse.json({ run });
});
