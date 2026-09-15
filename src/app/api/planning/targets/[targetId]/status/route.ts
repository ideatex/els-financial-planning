import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { updateTargetStatus } from '@/server/services/management-target.service';

export const PATCH = createApiHandler(async (req: NextRequest, { params }) => {
  const token = extractBearerToken(req);
  const targetId = params.targetId as string;
  const body = await req.json();

  // If approving or rejecting, require TARGETS_APPROVE; otherwise TARGETS_MANAGE (e.g. submit)
  const requiredPerm =
    body.status === 'APPROVED' || body.status === 'REJECTED' || body.status === 'LOCKED'
      ? Permissions.TARGETS_APPROVE
      : Permissions.TARGETS_MANAGE;

  const context = await requirePermission(requiredPerm, token);

  const updated = await updateTargetStatus(context.organization.id, context.user.id, targetId, body);

  return NextResponse.json(updated);
});
