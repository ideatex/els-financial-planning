import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission, COOKIE_NAME } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { getFiscalCalendars, createFiscalCalendar } from '@/server/services/calendar.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
  const context = await requirePermission(Permissions.MASTER_DATA_VIEW, token);

  const calendars = await getFiscalCalendars(context.organization.id);
  return NextResponse.json({ calendars });
});

export const POST = createApiHandler(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
  const context = await requirePermission(Permissions.CALENDAR_MANAGE, token);

  const body = await req.json();
  const calendar = await createFiscalCalendar(context.organization.id, context.user.id, body);
  return NextResponse.json({ calendar }, { status: 201 });
});
