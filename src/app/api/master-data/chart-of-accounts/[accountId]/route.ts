import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission, COOKIE_NAME } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { getAccountById, updateAccount, deleteAccount } from '@/server/services/coa.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const accountId = Array.isArray(params.accountId) ? params.accountId[0] : params.accountId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.MASTER_DATA_VIEW, token);

    const account = await getAccountById(context.organization.id, accountId);
    return NextResponse.json({ account });
  }
);

export const PUT = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const accountId = Array.isArray(params.accountId) ? params.accountId[0] : params.accountId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.MASTER_DATA_MANAGE, token);

    const body = await req.json();
    const account = await updateAccount(context.organization.id, context.user.id, accountId, body);
    return NextResponse.json({ account });
  }
);

export const DELETE = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const accountId = Array.isArray(params.accountId) ? params.accountId[0] : params.accountId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.MASTER_DATA_MANAGE, token);

    const result = await deleteAccount(context.organization.id, context.user.id, accountId);
    return NextResponse.json(result);
  }
);
