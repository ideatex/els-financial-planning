import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { getForecastById } from '@/server/services/forecast.service';
import { db } from '@/lib/db';
import { NotFoundError, BadRequestError } from '@/core/errors/AppError';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest, { params }) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.FORECAST_VIEW, token);
  const id = params.id as string;

  const forecast = await getForecastById(context.organization.id, id);
  return NextResponse.json(forecast);
});

export const PUT = createApiHandler(async (req: NextRequest, { params }) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.FORECAST_EDIT, token);
  const id = params.id as string;

  const forecast = await db.planVersion.findFirst({
    where: { id, organizationId: context.organization.id },
  });
  if (!forecast) throw new NotFoundError('Forecast version not found.');
  if (forecast.isLocked) throw new BadRequestError('Cannot edit locked forecast.');

  const body = await req.json();
  const updated = await db.planVersion.update({
    where: { id: forecast.id },
    data: {
      versionName: body.name ?? forecast.versionName,
      description: body.description ?? forecast.description,
      updatedById: context.user.id,
    },
  });

  return NextResponse.json(updated);
});
