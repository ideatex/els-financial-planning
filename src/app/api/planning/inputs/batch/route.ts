import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { batchUpsertPlanInputs } from '@/server/services/plan-input.service';

export const POST = createApiHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.PLAN_INPUTS_EDIT, token);

  const body = await req.json();
  const result = await batchUpsertPlanInputs(context.organization.id, context.user.id, body);

  return NextResponse.json(result);
});
