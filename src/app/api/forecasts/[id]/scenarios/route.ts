import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { db } from '@/lib/db';
import { createScenarioVersion } from '@/server/services/scenario.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest, { params }) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.FORECAST_VIEW, token);
  const id = params.id as string;

  const scenarios = await db.planVersion.findMany({
    where: {
      organizationId: context.organization.id,
      sourceForecastVersionId: id,
      forecastType: 'SCENARIO_FORECAST',
    },
    include: {
      owner: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(scenarios);
});

export const POST = createApiHandler(async (req: NextRequest, { params }) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.SCENARIO_MANAGE, token);
  const id = params.id as string;

  const body = await req.json();
  const scenario = await createScenarioVersion(context.organization.id, context.user.id, {
    baseForecastVersionId: id,
    name: body.name,
    code: body.code,
    description: body.description,
    scenarioType: body.scenarioType ?? 'CUSTOM',
    deltas: body.deltas,
  });

  return NextResponse.json(scenario, { status: 201 });
});
