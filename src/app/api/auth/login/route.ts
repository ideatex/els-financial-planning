import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api-handler';
import { loginSchema } from '@/lib/validations/auth';
import { loginUser } from '@/server/services/auth.service';
import { COOKIE_NAME, SESSION_DURATION_MS } from '@/lib/session';

export const POST = createApiHandler(async (req: NextRequest) => {
  const body = await req.json();
  const validated = loginSchema.parse(body);

  const userAgent = req.headers.get('user-agent');
  const forwardedFor = req.headers.get('x-forwarded-for');

  const result = await loginUser(validated, {
    userAgent,
    ip: forwardedFor,
  });

  const response = NextResponse.json(
    {
      user: result.user,
      organization: result.organization,
      membership: result.membership,
      token: result.sessionToken,
    },
    { status: 200 }
  );

  response.cookies.set(COOKIE_NAME, result.sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_DURATION_MS / 1000),
  });

  return response;
});
