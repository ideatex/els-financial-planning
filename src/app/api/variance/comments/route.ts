import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { createVarianceComment, getVarianceComments } from '@/server/services/variance.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.VARIANCE_VIEW, token);

  const { searchParams } = new URL(req.url);
  const planVersionId = searchParams.get('planVersionId') || undefined;
  const fiscalPeriodId = searchParams.get('fiscalPeriodId') || undefined;
  const metricCode = searchParams.get('metricCode') || undefined;
  const status = searchParams.get('status') || undefined;

  const comments = await getVarianceComments(context.organization.id, {
    planVersionId,
    fiscalPeriodId,
    metricCode,
    status,
  });

  return NextResponse.json(comments);
});

export const POST = createApiHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.VARIANCE_COMMENT, token);

  const body = await req.json();
  const comment = await createVarianceComment(context.organization.id, context.user.id, body);
  return NextResponse.json(comment, { status: 201 });
});
