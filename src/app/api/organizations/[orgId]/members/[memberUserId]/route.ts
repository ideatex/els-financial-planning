import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission, COOKIE_NAME } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { ForbiddenError } from '@/core/errors/AppError';
import { updateMemberRoleSchema } from '@/lib/validations/organization';
import { updateMemberRole, removeMemberFromOrganization } from '@/server/services/organization.service';

export const dynamic = 'force-dynamic';

export const PATCH = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const orgId = Array.isArray(params.orgId) ? params.orgId[0] : params.orgId;
    const memberUserId = Array.isArray(params.memberUserId) ? params.memberUserId[0] : params.memberUserId;

    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.ORG_MANAGE_MEMBERS, token);

    if (context.organization?.id !== orgId) {
      throw new ForbiddenError('Cannot manage members outside your active organization');
    }

    const body = await req.json();
    const validated = updateMemberRoleSchema.parse(body);

    const updated = await updateMemberRole(context.user.id, orgId, memberUserId, validated.role);
    return NextResponse.json({ membership: updated });
  }
);

export const DELETE = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const orgId = Array.isArray(params.orgId) ? params.orgId[0] : params.orgId;
    const memberUserId = Array.isArray(params.memberUserId) ? params.memberUserId[0] : params.memberUserId;

    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.ORG_MANAGE_MEMBERS, token);

    if (context.organization?.id !== orgId) {
      throw new ForbiddenError('Cannot manage members outside your active organization');
    }

    await removeMemberFromOrganization(context.user.id, orgId, memberUserId);
    return NextResponse.json({ success: true });
  }
);
