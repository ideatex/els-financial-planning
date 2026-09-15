import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.ACTUALS_VIEW, token);

  const { searchParams } = new URL(req.url);
  const fiscalPeriodId = searchParams.get('fiscalPeriodId') || undefined;
  const plantId = searchParams.get('plantId') || undefined;
  const productId = searchParams.get('productId') || undefined;
  const importBatchId = searchParams.get('importBatchId') || undefined;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '50', 10);

  const where: Record<string, unknown> = { organizationId: context.organization.id };
  if (fiscalPeriodId) where.fiscalPeriodId = fiscalPeriodId;
  if (plantId) where.plantId = plantId;
  if (productId) where.productId = productId;
  if (importBatchId) where.importBatchId = importBatchId;

  const skip = (page - 1) * limit;
  const [records, total] = await Promise.all([
    db.actualFinancialRecord.findMany({
      where,
      orderBy: { transactionDate: 'desc' },
      skip,
      take: limit,
      include: {
        account: { select: { id: true, code: true, name: true, accountType: true } },
        plant: { select: { id: true, code: true, name: true } },
        product: { select: { id: true, code: true, name: true } },
        importBatch: { select: { id: true, name: true, originalFileName: true } },
      },
    }),
    db.actualFinancialRecord.count({ where }),
  ]);

  return NextResponse.json({ records, total, page, limit, totalPages: Math.ceil(total / limit) });
});
