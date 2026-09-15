import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { profileCsvContent } from '@/server/services/actual-import.service';

export const dynamic = 'force-dynamic';

export const POST = createApiHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req);
  await requirePermission(Permissions.ACTUALS_UPLOAD, token);

  const { fileContent, fileName } = await req.json();
  const profile = profileCsvContent(fileContent, fileName);
  return NextResponse.json(profile);
});
