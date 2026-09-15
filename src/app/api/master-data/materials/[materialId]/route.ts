import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, extractBearerToken } from '@/lib/api-handler';
import { requirePermission, COOKIE_NAME } from '@/lib/session';
import { Permissions } from '@/core/domain/roles';
import { getMaterialById, updateMaterial, deleteMaterial } from '@/server/services/material.service';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const materialId = Array.isArray(params.materialId) ? params.materialId[0] : params.materialId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.MASTER_DATA_VIEW, token);

    const material = await getMaterialById(context.organization.id, materialId);
    return NextResponse.json({ material });
  }
);

export const PUT = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const materialId = Array.isArray(params.materialId) ? params.materialId[0] : params.materialId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.MASTER_DATA_MANAGE, token);

    const body = await req.json();
    const material = await updateMaterial(context.organization.id, context.user.id, materialId, body);
    return NextResponse.json({ material });
  }
);

export const DELETE = createApiHandler(
  async (req: NextRequest, { params }: { params: Record<string, string | string[]> }) => {
    const materialId = Array.isArray(params.materialId) ? params.materialId[0] : params.materialId;
    const token = req.cookies.get(COOKIE_NAME)?.value || extractBearerToken(req);
    const context = await requirePermission(Permissions.MASTER_DATA_MANAGE, token);

    const result = await deleteMaterial(context.organization.id, context.user.id, materialId);
    return NextResponse.json(result);
  }
);
