import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission, COOKIE_NAME } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { getMaterials, createMaterial } from '@/server/services/material.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
  const context = await requirePermission(Permissions.MASTER_DATA_VIEW, token);

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') || undefined;
  const category = searchParams.get('category') || undefined;
  const isActiveParam = searchParams.get('isActive');
  const isActive = isActiveParam !== null ? isActiveParam === 'true' : undefined;

  const materials = await getMaterials(context.organization.id, {
    search,
    category,
    isActive,
  });

  return NextResponse.json({ materials });
});

export const POST = createApiHandler(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
  const context = await requirePermission(Permissions.MASTER_DATA_MANAGE, token);

  const body = await req.json();
  const material = await createMaterial(context.organization.id, context.user.id, body);
  return NextResponse.json({ material }, { status: 201 });
});
