import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import {
  submitForecastForReview,
  approveForecast,
  rejectForecast,
  publishForecast,
  lockForecast,
  supersedeForecast,
} from '@/server/services/forecast.service';
import { BadRequestError } from '@/core/errors/AppError';

export const dynamic = 'force-dynamic';

export const POST = createApiHandler(async (req: NextRequest, { params }) => {
  const token = extractBearerToken(req);
  const id = params.id as string;
  const body = await req.json();
  const { action, notes, reason, newForecastId } = body;

  switch (action) {
    case 'SUBMIT_FOR_REVIEW': {
      const context = await requirePermission(Permissions.FORECAST_SUBMIT, token);
      const res = await submitForecastForReview(context.organization.id, context.user.id, id, notes);
      return NextResponse.json(res);
    }
    case 'APPROVE': {
      const context = await requirePermission(Permissions.FORECAST_APPROVE, token);
      const res = await approveForecast(context.organization.id, context.user.id, id, notes);
      return NextResponse.json(res);
    }
    case 'REJECT': {
      const context = await requirePermission(Permissions.FORECAST_APPROVE, token);
      if (!reason) throw new BadRequestError('A rejection reason is required.');
      const res = await rejectForecast(context.organization.id, context.user.id, id, reason);
      return NextResponse.json(res);
    }
    case 'PUBLISH': {
      const context = await requirePermission(Permissions.FORECAST_PUBLISH, token);
      const res = await publishForecast(context.organization.id, context.user.id, id, notes);
      return NextResponse.json(res);
    }
    case 'LOCK': {
      const context = await requirePermission(Permissions.FORECAST_LOCK, token);
      const res = await lockForecast(context.organization.id, context.user.id, id, notes);
      return NextResponse.json(res);
    }
    case 'SUPERSEDE': {
      const context = await requirePermission(Permissions.FORECAST_SUPERSEDE, token);
      if (!newForecastId) throw new BadRequestError('newForecastId is required to supersede.');
      const res = await supersedeForecast(context.organization.id, context.user.id, id, newForecastId);
      return NextResponse.json(res);
    }
    default:
      throw new BadRequestError(`Unsupported governance action: '${action}'.`);
  }
});
