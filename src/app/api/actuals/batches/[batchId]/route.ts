import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { getActualImportBatchById } from '@/server/services/actual-import.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest, { params }) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.ACTUALS_VIEW, token);

  const batchId = params.batchId as string;
  const batch = await getActualImportBatchById(context.organization.id, batchId);
  return NextResponse.json(batch);
});
