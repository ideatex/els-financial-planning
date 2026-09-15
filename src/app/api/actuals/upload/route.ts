import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { uploadActualsBatch } from '@/server/services/actual-import.service';

export const dynamic = 'force-dynamic';

export const POST = createApiHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.ACTUALS_UPLOAD, token);

  const body = await req.json();
  const batch = await uploadActualsBatch(context.organization.id, context.user.id, body);
  return NextResponse.json(batch, { status: 201 });
});
