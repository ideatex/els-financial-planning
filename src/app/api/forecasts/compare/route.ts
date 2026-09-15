import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { getForecastSummary } from '@/server/services/forecast.service';
import { BadRequestError } from '@/core/errors/AppError';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.FORECAST_VIEW, token);

  const { searchParams } = new URL(req.url);
  const versionIdsParam = searchParams.get('versionIds');

  if (!versionIdsParam) {
    throw new BadRequestError('versionIds query parameter (comma-separated) is required.');
  }

  const versionIds = versionIdsParam.split(',').filter(Boolean);
  const summaries = await Promise.all(
    versionIds.map((id) => getForecastSummary(context.organization.id, id))
  );

  return NextResponse.json({ forecasts: summaries });
});
