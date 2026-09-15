import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission, COOKIE_NAME } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { getOrganizationAuditLogs } from '@/server/services/audit.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
  const context = await requirePermission(Permissions.ORG_VIEW_AUDIT, token);

  const orgId = context.organization.id;
  const limitParam = req.nextUrl.searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 50;

  const logs = await getOrganizationAuditLogs(orgId, limit);
  return NextResponse.json({ logs });
});
