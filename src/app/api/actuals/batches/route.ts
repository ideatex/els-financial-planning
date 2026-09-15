import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { getActualImportBatches } from '@/server/services/actual-import.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.ACTUALS_VIEW, token);

  const { searchParams } = new URL(req.url);
  const fiscalPeriodId = searchParams.get('fiscalPeriodId') || undefined;
  const plantId = searchParams.get('plantId') || undefined;
  const importType = searchParams.get('importType') || undefined;
  const status = searchParams.get('status') || undefined;

  const batches = await getActualImportBatches(context.organization.id, {
    fiscalPeriodId,
    plantId,
    importType,
    status,
  });

  return NextResponse.json(batches);
});
