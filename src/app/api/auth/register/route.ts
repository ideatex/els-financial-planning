import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { registerSchema } from '@/lib/validations/auth';
import { registerUser } from '@/server/services/auth.service';
import { COOKIE_NAME, SESSION_DURATION_MS } from '@/lib/session';

export const POST = createApiHandler(async (req: NextRequest) => {
  const body = await req.json();
  const validated = registerSchema.parse(body);

  const userAgent = req.headers.get('user-agent');
  const forwardedFor = req.headers.get('x-forwarded-for');

  const result = await registerUser(validated, {
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
    { status: 201 }
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
