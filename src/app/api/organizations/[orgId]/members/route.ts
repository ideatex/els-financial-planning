import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requireAuth, requirePermission, COOKIE_NAME } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { ForbiddenError } from '@/core/errors/AppError';
import { addMemberSchema } from '@/lib/validations/organization';
import { getOrganizationMembers, addMemberToOrganization } from '@/server/services/organization.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const orgId = Array.isArray(params.orgId) ? params.orgId[0] : params.orgId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requireAuth(token);

    // Verify user is a member of this organization
    const isMember = context.user && (context.organization?.id === orgId || context.session.activeOrganizationId === orgId);
    if (!isMember) {
      throw new ForbiddenError('You are not a member of this organization');
    }

    const members = await getOrganizationMembers(orgId);
    return NextResponse.json({ members });
  }
);

export const POST = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const orgId = Array.isArray(params.orgId) ? params.orgId[0] : params.orgId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);

    // Requires ADMIN / ORG_MANAGE_MEMBERS
    const context = await requirePermission(Permissions.ORG_MANAGE_MEMBERS, token);

    if (context.organization?.id !== orgId) {
      throw new ForbiddenError('Cannot manage members outside your active organization');
    }

    const body = await req.json();
    const validated = addMemberSchema.parse(body);

    const member = await addMemberToOrganization(context.user.id, orgId, validated);
    return NextResponse.json({ member }, { status: 201 });
  }
);
