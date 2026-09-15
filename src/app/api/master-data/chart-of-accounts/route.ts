import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission, COOKIE_NAME } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { getAccounts, getAccountTree, createAccount } from '@/server/services/coa.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
  const context = await requirePermission(Permissions.MASTER_DATA_VIEW, token);

  const { searchParams } = new URL(req.url);
  const asTree = searchParams.get('asTree') === 'true';
  const accountType = searchParams.get('accountType') || undefined;
  const search = searchParams.get('search') || undefined;
  const isActiveParam = searchParams.get('isActive');
  const isActive = isActiveParam !== null ? isActiveParam === 'true' : undefined;

  if (asTree) {
    const tree = await getAccountTree(context.organization.id);
    return NextResponse.json({ accounts: tree, isTree: true });
  }

  const accounts = await getAccounts(context.organization.id, {
    accountType,
    search,
    isActive,
  });
  return NextResponse.json({ accounts, isTree: false });
});

export const POST = createApiHandler(async (req: NextRequest) => {
  const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
  const context = await requirePermission(Permissions.MASTER_DATA_MANAGE, token);

  const body = await req.json();
  const account = await createAccount(context.organization.id, context.user.id, body);
  return NextResponse.json({ account }, { status: 201 });
});
