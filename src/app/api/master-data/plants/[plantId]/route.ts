import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission, COOKIE_NAME } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { getPlantById, updatePlant, deletePlant } from '@/server/services/plant.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const plantId = Array.isArray(params.plantId) ? params.plantId[0] : params.plantId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.MASTER_DATA_VIEW, token);

    const plant = await getPlantById(context.organization.id, plantId);
    return NextResponse.json({ plant });
  }
);

export const PUT = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const plantId = Array.isArray(params.plantId) ? params.plantId[0] : params.plantId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.MASTER_DATA_MANAGE, token);

    const body = await req.json();
    const plant = await updatePlant(context.organization.id, context.user.id, plantId, body);
    return NextResponse.json({ plant });
  }
);

export const DELETE = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const plantId = Array.isArray(params.plantId) ? params.plantId[0] : params.plantId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.MASTER_DATA_MANAGE, token);

    const result = await deletePlant(context.organization.id, context.user.id, plantId);
    return NextResponse.json(result);
  }
);
