import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { updateVarianceComment } from '@/server/services/variance.service';

export const dynamic = 'force-dynamic';

export const PATCH = createApiHandler(async (req: NextRequest, { params }) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.VARIANCE_COMMENT, token);

  const commentId = params.commentId as string;
  const body = await req.json();
  const updated = await updateVarianceComment(context.organization.id, context.user.id, commentId, body);
  return NextResponse.json(updated);
});
