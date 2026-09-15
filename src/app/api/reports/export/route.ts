import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { calculatePlanVsActualVariance } from '@/server/services/variance.service';
import { exportReportCsv } from '@/server/services/reporting.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.REPORTS_EXPORT, token);

  const { searchParams } = new URL(req.url);
  const planVersionId = searchParams.get('planVersionId');
  const fiscalPeriodId = searchParams.get('fiscalPeriodId');
  const plantId = searchParams.get('plantId') || undefined;
  const productId = searchParams.get('productId') || undefined;
  const reportType = searchParams.get('type') || 'pnl';

  if (!planVersionId || !fiscalPeriodId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Missing required parameters: planVersionId, fiscalPeriodId' } },
      { status: 400 }
    );
  }

  const varianceData = await calculatePlanVsActualVariance(context.organization.id, {
    planVersionId,
    fiscalPeriodId,
    plantId,
    productId,
  });

  const headers = ['Metric Code', 'Line Item Name', 'Category', 'Unit', 'Plan Value', 'Actual Value', 'Variance Amount', 'Variance %', 'Favorability'];
  const rows = varianceData.items.map((i) => [
    i.metricCode,
    i.metricName,
    i.category,
    i.unitOfMeasure,
    i.planValue,
    i.actualValue,
    i.varianceAmount,
    i.variancePercent !== null ? `${i.variancePercent}%` : (i.zeroPlanState ?? 'N/A'),
    i.favorability,
  ]);

  const csvContent = exportReportCsv(
    `Manufacturing Variance Report (${reportType.toUpperCase()})`,
    {
      organization: context.organization.name,
      planVersion: varianceData.planVersion.versionCode,
      period: varianceData.fiscalPeriod.periodName,
      currency: varianceData.currency,
    },
    headers,
    rows
  );

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="variance_report_${varianceData.fiscalPeriod.periodName.replace(/[^a-zA-Z0-9]/g, '_')}.csv"`,
    },
  });
});
