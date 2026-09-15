import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { copyVersionData } from '@/server/services/version-copy.service';

export const POST = createApiHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.VERSION_COPY, token);

  const body = await req.json();
  const result = await copyVersionData(context.organization.id, context.user.id, body);

  return NextResponse.json(result);
});
