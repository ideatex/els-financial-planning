import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { getCalculationRunById } from '@/server/services/calculation.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest, { params }) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.PLAN_VIEW, token);

  const runId = params.runId as string;
  const run = await getCalculationRunById(context.organization.id, runId);
  return NextResponse.json(run);
});
