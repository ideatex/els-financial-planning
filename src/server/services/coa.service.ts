import { db } from '@/lib/db';
import { recordAuditLog } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/core/errors/AppError';
import { createAccountSchema, updateAccountSchema } from '@/lib/validations/master-data';
import { z } from 'zod';

export async function getAccounts(
  orgId: string,
  filters?: { accountType?: string; search?: string; isActive?: boolean }
) {
  const where: Record<string, unknown> = { organizationId: orgId };

  if (filters?.isActive !== undefined) {
    where.isActive = filters.isActive;
  }
  if (filters?.accountType) {
    where.accountType = filters.accountType;
  }
  if (filters?.search) {
    const q = filters.search.trim();
    where.OR = [
      { code: { contains: q } },
      { name: { contains: q } },
    ];
  }

  return db.account.findMany({
    where,
    orderBy: { code: 'asc' },
    include: {
      parentAccount: { select: { id: true, code: true, name: true } },
      _count: { select: { childAccounts: true } },
    },
  });
}

export interface AccountTreeNode {
  id: string;
  code: string;
  name: string;
  accountType: string;
  normalBalance: string;
  parentAccountId: string | null;
  isActive: boolean;
  children: AccountTreeNode[];
  childAccounts: AccountTreeNode[];
}

export async function getAccountTree(orgId: string): Promise<AccountTreeNode[]> {
  const accounts = await db.account.findMany({
    where: { organizationId: orgId },
    orderBy: { code: 'asc' },
  });

  const nodeMap = new Map<string, AccountTreeNode>();
  accounts.forEach((acc) => {
    nodeMap.set(acc.id, {
      id: acc.id,
      code: acc.code,
      name: acc.name,
      accountType: acc.accountType,
      normalBalance: acc.normalBalance,
      parentAccountId: acc.parentAccountId,
      isActive: acc.isActive,
      children: [],
      childAccounts: [],
    });
  });

  const roots: AccountTreeNode[] = [];

  nodeMap.forEach((node) => {
    if (node.parentAccountId && nodeMap.has(node.parentAccountId)) {
      const parent = nodeMap.get(node.parentAccountId)!;
      parent.children.push(node);
      parent.childAccounts.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

export async function getAccountById(orgId: string, accountId: string) {
  const account = await db.account.findFirst({
    where: { id: accountId, organizationId: orgId },
    include: {
      parentAccount: true,
      childAccounts: {
        orderBy: { code: 'asc' },
      },
    },
  });

  if (!account) {
    throw new NotFoundError(`Account with ID '${accountId}' not found`);
  }

  return account;
}

export async function createAccount(
  orgId: string,
  userId: string,
  data: z.infer<typeof createAccountSchema>
) {
  const validated = createAccountSchema.parse(data);

  const existing = await db.account.findUnique({
    where: {
      organizationId_code: {
        organizationId: orgId,
        code: validated.code,
      },
    },
  });

  if (existing) {
    throw new ConflictError(`Account with code '${validated.code}' already exists`);
  }

  if (validated.parentAccountId) {
    const parent = await db.account.findFirst({
      where: { id: validated.parentAccountId, organizationId: orgId },
    });
    if (!parent) {
      throw new NotFoundError('Selected parent account does not exist in this organization');
    }
  }

  const account = await db.account.create({
    data: {
      ...validated,
      organizationId: orgId,
      createdById: userId,
      updatedById: userId,
    },
    include: { parentAccount: true },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'ACCOUNT_CREATED',
    entityType: 'ACCOUNT',
    entityId: account.id,
    metadata: { code: account.code, name: account.name, type: account.accountType },
  });

  return account;
}

/**
 * Validates that `newParentId` is not the account itself or one of its descendants.
 */
async function checkCircularParent(
  orgId: string,
  targetAccountId: string,
  newParentId: string
): Promise<boolean> {
  if (targetAccountId === newParentId) return true;

  let currentParentId: string | null = newParentId;
  const visited = new Set<string>([targetAccountId]);

  while (currentParentId) {
    if (visited.has(currentParentId)) {
      return true; // Cycle detected
    }
    visited.add(currentParentId);

    const parent: { parentAccountId: string | null } | null = await db.account.findUnique({
      where: { id: currentParentId },
      select: { parentAccountId: true },
    });

    currentParentId = parent?.parentAccountId || null;
  }

  return false;
}

export async function updateAccount(
  orgId: string,
  userId: string,
  accountId: string,
  data: z.infer<typeof updateAccountSchema>
) {
  const validated = updateAccountSchema.parse(data);
  const existing = await getAccountById(orgId, accountId);

  if (validated.parentAccountId) {
    const isCircular = await checkCircularParent(orgId, existing.id, validated.parentAccountId);
    if (isCircular) {
      throw new ValidationError('Circular account hierarchy detected: An account cannot be a child of itself or its descendants.');
    }
  }

  const updated = await db.account.update({
    where: { id: existing.id },
    data: {
      ...validated,
      updatedById: userId,
    },
    include: { parentAccount: true },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'ACCOUNT_UPDATED',
    entityType: 'ACCOUNT',
    entityId: updated.id,
    metadata: { code: updated.code, changes: validated },
  });

  return updated;
}

export async function deleteAccount(
  orgId: string,
  userId: string,
  accountId: string
) {
  const account = await getAccountById(orgId, accountId);

  if (account.childAccounts.length > 0) {
    throw new ValidationError(
      `Cannot delete account '${account.code}' because it has ${account.childAccounts.length} child accounts. Reassign or delete child accounts first.`
    );
  }

  await db.account.delete({
    where: { id: account.id },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'ACCOUNT_DELETED',
    entityType: 'ACCOUNT',
    entityId: accountId,
    metadata: { code: account.code, name: account.name },
  });

  return { success: true };
}
