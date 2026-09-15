import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { createRollingForecast } from '@/server/services/forecast.service';

export const dynamic = 'force-dynamic';

export const POST = createApiHandler(async (req: NextRequest, { params }) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.FORECAST_CREATE, token);
  const id = params.id as string;

  const body = await req.json();
  const rollingForecast = await createRollingForecast(context.organization.id, context.user.id, {
    sourceForecastVersionId: id,
    name: body.name,
    code: body.code,
    description: body.description,
    advanceCutoffByPeriods: body.advanceCutoffByPeriods ?? 1,
    extendHorizonByPeriods: body.extendHorizonByPeriods ?? 1,
  });

  return NextResponse.json(rollingForecast, { status: 201 });
});
