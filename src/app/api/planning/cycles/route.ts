import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission, COOKIE_NAME } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { getPlanningCycles, createPlanningCycle } from '@/server/services/planning-cycle.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
  const context = await requirePermission(Permissions.PLAN_VIEW, token);

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || undefined;
  const fiscalYearParam = searchParams.get('fiscalYear');
  const fiscalYear = fiscalYearParam ? parseInt(fiscalYearParam, 10) : undefined;
  const search = searchParams.get('search') || undefined;

  const cycles = await getPlanningCycles(context.organization.id, {
    status,
    fiscalYear,
    search,
  });

  return NextResponse.json({ cycles });
});

export const POST = createApiHandler(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
  const context = await requirePermission(Permissions.PLAN_CYCLE_MANAGE, token);

  const body = await req.json();
  const cycle = await createPlanningCycle(context.organization.id, context.user.id, body);
  return NextResponse.json({ cycle }, { status: 201 });
});
