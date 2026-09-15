import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requireAuth, COOKIE_NAME } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
  const context = await requireAuth(token);

  return NextResponse.json({
    user: context.user,
    organization: context.organization,
    membership: context.membership,
  });
});
