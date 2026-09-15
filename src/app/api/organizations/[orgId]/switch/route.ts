import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requireAuth, COOKIE_NAME } from '@/lib/session';
import { switchActiveOrganization } from '@/server/services/organization.service';

export const dynamic = 'force-dynamic';

export const POST = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const orgId = Array.isArray(params.orgId) ? params.orgId[0] : params.orgId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requireAuth(token);

    const switched = await switchActiveOrganization(context.session.token, context.user.id, orgId);

    return NextResponse.json({
      success: true,
      activeOrganization: switched.organization,
      role: switched.role,
    });
  }
);
