import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { logoutUser } from '@/server/services/auth.service';
import { COOKIE_NAME } from '@/lib/session';

export const POST = createApiHandler(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);

  if (token) {
    await logoutUser(token);
  }

  const response = NextResponse.json({ success: true }, { status: 200 });

  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
});
