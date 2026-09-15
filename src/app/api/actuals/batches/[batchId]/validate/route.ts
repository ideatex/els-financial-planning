import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { validateActualsBatch } from '@/server/services/actual-import.service';

export const dynamic = 'force-dynamic';

export const POST = createApiHandler(async (req: NextRequest, { params }) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.ACTUALS_VALIDATE, token);

  const batchId = params.batchId as string;
  const validated = await validateActualsBatch(context.organization.id, context.user.id, batchId);
  return NextResponse.json(validated);
});
