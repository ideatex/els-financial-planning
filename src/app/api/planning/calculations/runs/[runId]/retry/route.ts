import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { retryCalculationRun } from '@/server/services/calculation.service';

export const dynamic = 'force-dynamic';

export const POST = createApiHandler(async (req: NextRequest, { params }) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.PLAN_CALCULATE, token);

  const runId = params.runId as string;
  const result = await retryCalculationRun(context.organization.id, context.user.id, runId);
  return NextResponse.json(result);
});
