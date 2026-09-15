import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { compareVersions } from '@/server/services/version-comparison.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.VERSION_COMPARE, token);

  const { searchParams } = new URL(req.url);
  const sourceVersionId = searchParams.get('sourceVersionId');
  const targetVersionId = searchParams.get('targetVersionId');
  const category = searchParams.get('category') || undefined;

  if (!sourceVersionId || !targetVersionId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Both sourceVersionId and targetVersionId are required' } },
      { status: 400 }
    );
  }

  const result = await compareVersions(context.organization.id, sourceVersionId, targetVersionId, category);

  return NextResponse.json(result);
});
