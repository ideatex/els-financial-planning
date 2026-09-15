import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { bulkImportTargets } from '@/server/services/management-target.service';

export const POST = createApiHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.TARGETS_MANAGE, token);

  const { searchParams } = new URL(req.url);
  const commit = searchParams.get('commit') === 'true';

  const body = await req.json();
  const report = await bulkImportTargets(context.organization.id, context.user.id, body, commit);

  return NextResponse.json(report, { status: commit ? 201 : 200 });
});
