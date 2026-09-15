import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { generatePnlReport } from '@/server/services/reporting.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.REPORTS_VIEW, token);

  const { searchParams } = new URL(req.url);
  const planVersionId = searchParams.get('planVersionId');
  const fiscalPeriodId = searchParams.get('fiscalPeriodId');
  const plantId = searchParams.get('plantId') || undefined;
  const productId = searchParams.get('productId') || undefined;

  if (!planVersionId || !fiscalPeriodId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Missing required parameters: planVersionId, fiscalPeriodId' } },
      { status: 400 }
    );
  }

  const report = await generatePnlReport(context.organization.id, {
    planVersionId,
    fiscalPeriodId,
    plantId,
    productId,
  });

  return NextResponse.json(report);
});
