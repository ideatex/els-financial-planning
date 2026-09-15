import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission, COOKIE_NAME } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { getFiscalCalendarById, generateAdditionalFiscalYear } from '@/server/services/calendar.service';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const calendarId = Array.isArray(params.calendarId) ? params.calendarId[0] : params.calendarId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.MASTER_DATA_VIEW, token);

    const calendar = await getFiscalCalendarById(context.organization.id, calendarId);
    return NextResponse.json({ calendar });
  }
);

const addYearSchema = z.object({
  fiscalYear: z.number().int().min(2020).max(2050),
});

export const POST = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const calendarId = Array.isArray(params.calendarId) ? params.calendarId[0] : params.calendarId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.CALENDAR_MANAGE, token);

    const body = await req.json();
    const { fiscalYear } = addYearSchema.parse(body);

    const updated = await generateAdditionalFiscalYear(
      context.organization.id,
      context.user.id,
      calendarId,
      fiscalYear
    );
    return NextResponse.json({ calendar: updated });
  }
);
