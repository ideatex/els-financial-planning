import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requireAuth, COOKIE_NAME } from '@/lib/session';
import { createOrganizationSchema } from '@/lib/validations/organization';
import { getUserOrganizations, createOrganization } from '@/server/services/organization.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
  const context = await requireAuth(token);

  const orgs = await getUserOrganizations(context.user.id);
  return NextResponse.json({ organizations: orgs });
});

export const POST = createApiHandler(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
  const context = await requireAuth(token);

  const body = await req.json();
  const validated = createOrganizationSchema.parse(body);

  const org = await createOrganization(context.user.id, validated);
  return NextResponse.json({ organization: org }, { status: 201 });
});
