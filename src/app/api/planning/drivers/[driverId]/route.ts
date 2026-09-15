import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import {
  getDriverById,
  updateDriver,
  deleteDriver,
} from '@/server/services/driver.service';

export const GET = createApiHandler(async (req: NextRequest, { params }) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.PLAN_INPUTS_VIEW, token);

  const driverId = params.driverId as string;
  const driver = await getDriverById(context.organization.id, driverId);

  return NextResponse.json(driver);
});

export const PATCH = createApiHandler(async (req: NextRequest, { params }) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.DRIVERS_MANAGE, token);

  const driverId = params.driverId as string;
  const body = await req.json();
  const updated = await updateDriver(context.organization.id, context.user.id, driverId, body);

  return NextResponse.json(updated);
});

export const DELETE = createApiHandler(async (req: NextRequest, { params }) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.DRIVERS_MANAGE, token);

  const driverId = params.driverId as string;
  const result = await deleteDriver(context.organization.id, context.user.id, driverId);

  return NextResponse.json(result);
});
