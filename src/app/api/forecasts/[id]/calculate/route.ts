import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { calculateForecast } from '@/server/services/forecast.service';

export const dynamic = 'force-dynamic';

export const POST = createApiHandler(async (req: NextRequest, { params }) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.FORECAST_CALCULATE, token);
  const id = params.id as string;

  let body = {};
  try {
    body = await req.json();
  } catch {
    // optional body
  }

  const result = await calculateForecast(context.organization.id, context.user.id, id, body);
  return NextResponse.json(result);
});
