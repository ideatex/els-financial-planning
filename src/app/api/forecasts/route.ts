import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { createForecastVersion, getForecastVersions } from '@/server/services/forecast.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.FORECAST_VIEW, token);

  const { searchParams } = new URL(req.url);
  const planningCycleId = searchParams.get('planningCycleId') || undefined;
  const forecastType = searchParams.get('forecastType') || undefined;
  const status = searchParams.get('status') || undefined;
  const isPublishedParam = searchParams.get('isPublished');
  const isPublished = isPublishedParam !== null ? isPublishedParam === 'true' : undefined;

  const forecasts = await getForecastVersions(context.organization.id, {
    planningCycleId,
    forecastType,
    status,
    isPublished,
  });

  return NextResponse.json(forecasts);
});

export const POST = createApiHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.FORECAST_CREATE, token);

  const body = await req.json();
  const forecast = await createForecastVersion(context.organization.id, context.user.id, body);

  return NextResponse.json(forecast, { status: 201 });
});
