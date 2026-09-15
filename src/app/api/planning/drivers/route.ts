import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { getDrivers, createDriver } from '@/server/services/driver.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.PLAN_INPUTS_VIEW, token);

  const { searchParams } = new URL(req.url);
  const drivers = await getDrivers(context.organization.id, {
    category: searchParams.get('category') || undefined,
    isActive: searchParams.has('isActive') ? searchParams.get('isActive') === 'true' : undefined,
    search: searchParams.get('search') || undefined,
  });

  return NextResponse.json({ drivers });
});

export const POST = createApiHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.DRIVERS_MANAGE, token);

  const body = await req.json();
  const created = await createDriver(context.organization.id, context.user.id, body);

  return NextResponse.json(created, { status: 201 });
});
