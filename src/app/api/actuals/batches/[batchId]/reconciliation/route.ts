import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { getBatchReconciliationResults, reconcileBatch } from '@/server/services/reconciliation.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest, { params }) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.RECONCILIATION_VIEW, token);

  const batchId = params.batchId as string;
  const results = await getBatchReconciliationResults(context.organization.id, batchId);
  return NextResponse.json(results);
});

export const POST = createApiHandler(async (req: NextRequest, { params }) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.ACTUALS_VALIDATE, token);

  const batchId = params.batchId as string;
  const results = await reconcileBatch(context.organization.id, batchId);
  return NextResponse.json(results);
});
