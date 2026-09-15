import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { saveMappingProfile } from '@/server/services/actual-import.service';

export const dynamic = 'force-dynamic';

export const POST = createApiHandler(async (req: NextRequest, { params }) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.ACTUALS_UPLOAD, token);

  const batchId = params.batchId as string;
  const body = await req.json();
  const updated = await saveMappingProfile(context.organization.id, context.user.id, batchId, body);
  return NextResponse.json(updated);
});
