import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { compareScenarios } from '@/server/services/scenario.service';
import { BadRequestError } from '@/core/errors/AppError';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.FORECAST_VIEW, token);

  const { searchParams } = new URL(req.url);
  const baseForecastVersionId = searchParams.get('baseForecastVersionId');
  const scenarioIdsParam = searchParams.get('scenarioVersionIds');

  if (!baseForecastVersionId) {
    throw new BadRequestError('baseForecastVersionId is required.');
  }

  const scenarioIds = scenarioIdsParam ? scenarioIdsParam.split(',') : [];

  const comparison = await compareScenarios(context.organization.id, baseForecastVersionId, scenarioIds);
  return NextResponse.json(comparison);
});

export const POST = createApiHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.FORECAST_VIEW, token);

  const body = await req.json();
  const { baseForecastVersionId, scenarioVersionIds } = body;

  if (!baseForecastVersionId || !scenarioVersionIds || !Array.isArray(scenarioVersionIds)) {
    throw new BadRequestError('baseForecastVersionId and scenarioVersionIds array are required.');
  }

  const comparison = await compareScenarios(context.organization.id, baseForecastVersionId, scenarioVersionIds);
  return NextResponse.json(comparison);
});
