import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { resolveVarianceComment } from '@/server/services/variance.service';

export const dynamic = 'force-dynamic';

export const POST = createApiHandler(async (req: NextRequest, { params }) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.VARIANCE_RESOLVE, token);

  const commentId = params.commentId as string;
  const body = await req.json();
  const resolved = await resolveVarianceComment(context.organization.id, context.user.id, commentId, body.resolutionNotes ?? 'Resolved');
  return NextResponse.json(resolved);
});
