import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission, COOKIE_NAME } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { updatePeriodStatus } from '@/server/services/calendar.service';

export const dynamic = 'force-dynamic';

export const PATCH = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const periodId = Array.isArray(params.periodId) ? params.periodId[0] : params.periodId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.CALENDAR_MANAGE, token);

    const body = await req.json();
    const period = await updatePeriodStatus(context.organization.id, context.user.id, periodId, body);
    return NextResponse.json({ period });
  }
);
