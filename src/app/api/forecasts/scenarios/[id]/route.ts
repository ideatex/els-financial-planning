import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { db } from '@/lib/db';
import { NotFoundError, BadRequestError } from '@/core/errors/AppError';
import { recordAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (req: NextRequest, { params }) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.FORECAST_VIEW, token);
  const id = params.id as string;

  const scenario = await db.planVersion.findFirst({
    where: {
      id,
      organizationId: context.organization.id,
      forecastType: 'SCENARIO_FORECAST',
    },
    include: {
      sourceForecastVersion: true,
      whatIfScenarioDeltas: { orderBy: { createdAt: 'asc' } },
      forecastPeriodSources: { include: { fiscalPeriod: true }, orderBy: { periodNumber: 'asc' } },
      owner: { select: { id: true, name: true, email: true } },
    },
  });

  if (!scenario) throw new NotFoundError('Scenario version not found.');
  return NextResponse.json(scenario);
});

export const DELETE = createApiHandler(async (req: NextRequest, { params }) => {
  const token = extractBearerToken(req);
  const context = await requirePermission(Permissions.SCENARIO_MANAGE, token);
  const id = params.id as string;

  const scenario = await db.planVersion.findFirst({
    where: {
      id,
      organizationId: context.organization.id,
      forecastType: 'SCENARIO_FORECAST',
    },
  });

  if (!scenario) throw new NotFoundError('Scenario version not found.');
  if (scenario.isLocked || scenario.status === 'LOCKED' || scenario.isPublished) {
    throw new BadRequestError('Cannot delete a locked or published scenario.');
  }

  await db.planVersion.delete({ where: { id: scenario.id } });

  await recordAuditLog({
    organizationId: context.organization.id,
    userId: context.user.id,
    action: 'DELETE_SCENARIO_VERSION',
    entityType: 'PlanVersion',
    entityId: scenario.id,
    metadata: { versionCode: scenario.versionCode },
  });

  return NextResponse.json({ success: true });
});
