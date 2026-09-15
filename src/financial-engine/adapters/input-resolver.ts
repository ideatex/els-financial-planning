/**
 * Input Resolver Adapter
 * Assembles an immutable InputSnapshot from the Prisma database
 */

import crypto from 'crypto';
import { db } from '@/lib/db';
import { InputSnapshot, SnapshotBom, SnapshotRouting, SnapshotPlanInput, SnapshotAssumption, SnapshotDriver } from '../domain/types/snapshot.types';
import { NotFoundError, ValidationError } from '@/core/errors/AppError';

export interface ResolveSnapshotParams {
  organizationId: string;
  planningCycleId: string;
  planVersionId: string;
  fiscalPeriodId: string;
  plantId: string;
  productId: string;
}

export async function resolveInputSnapshot(params: ResolveSnapshotParams): Promise<InputSnapshot> {
  const { organizationId, planningCycleId, planVersionId, fiscalPeriodId, plantId, productId } = params;

  // 1. Verify Plan Version
  const planVersion = await db.planVersion.findFirst({
    where: { id: planVersionId, organizationId, planningCycleId },
  });
  if (!planVersion) {
    throw new NotFoundError('Plan Version not found or does not belong to specified cycle/organization');
  }

  // 2. Verify Fiscal Period
  const fiscalPeriod = await db.fiscalPeriod.findFirst({
    where: { id: fiscalPeriodId },
  });
  if (!fiscalPeriod) {
    throw new NotFoundError('Fiscal Period not found');
  }

  // Calculate days in period
  const startMs = fiscalPeriod.startDate.getTime();
  const endMs = fiscalPeriod.endDate.getTime();
  const periodDays = Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)));

  // 3. Verify Plant
  const plant = await db.plant.findFirst({
    where: { id: plantId, organizationId },
  });
  if (!plant) {
    throw new NotFoundError('Plant not found');
  }

  // 4. Verify Product
  const product = await db.product.findFirst({
    where: { id: productId, organizationId },
  });
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  // 5. Query Active BOM
  let snapshotBom: SnapshotBom | null = null;
  const bomHeader = await db.bomHeader.findFirst({
    where: { organizationId, productId, isActive: true },
    include: {
      versions: {
        where: { status: 'APPROVED' },
        include: {
          lines: {
            include: {
              material: true,
            },
          },
        },
        orderBy: { versionNumber: 'desc' },
        take: 1,
      },
    },
  });

  if (bomHeader && bomHeader.versions.length > 0) {
    const activeVersion = bomHeader.versions[0];
    snapshotBom = {
      headerId: bomHeader.id,
      versionId: activeVersion.id,
      versionNumber: activeVersion.versionNumber,
      status: activeVersion.status,
      lines: activeVersion.lines.map((l) => ({
        id: l.id,
        materialId: l.materialId || '',
        materialCode: l.material?.code || 'UNKNOWN',
        materialName: l.material?.name || 'Unknown Material',
        quantityPerUnit: l.quantityPerUnit,
        unitOfMeasure: l.unitOfMeasure,
        scrapPercentage: l.scrapPercentage,
        unitPrice: (l.material?.defaultCostCents || 0) / 100,
      })),
    };
  }

  // 6. Query Active Routing
  let snapshotRouting: SnapshotRouting | null = null;
  const routingHeader = await db.routingHeader.findFirst({
    where: { organizationId, productId, plantId, isActive: true },
    include: {
      versions: {
        where: { status: 'APPROVED' },
        include: {
          operations: {
            orderBy: { sequence: 'asc' },
          },
        },
        orderBy: { versionNumber: 'desc' },
        take: 1,
      },
    },
  });

  // Query default labor rate from plan inputs (LABOR_HOURLY_RATE or LABOR_RATE), then driver, then global default
  const laborRateInput = await db.planInput.findFirst({
    where: {
      organizationId,
      planVersionId,
      fiscalPeriodId,
      inputCode: { in: ['LABOR_HOURLY_RATE', 'LABOR_RATE'] },
    },
    orderBy: { createdAt: 'desc' },
  });

  let defaultLaborRate = 30.0;
  if (laborRateInput && laborRateInput.inputValue > 0) {
    defaultLaborRate = laborRateInput.inputValue;
  } else {
    const laborDriver = await db.driver.findFirst({
      where: { organizationId, driverCode: { in: ['DRV-LABOR-RATE', 'DRV-LABOR-01'] } },
    });
    if (laborDriver?.defaultValue) {
      defaultLaborRate = laborDriver.defaultValue;
    }
  }

  if (routingHeader && routingHeader.versions.length > 0) {
    const activeVersion = routingHeader.versions[0];
    snapshotRouting = {
      headerId: routingHeader.id,
      versionId: activeVersion.id,
      versionNumber: activeVersion.versionNumber,
      status: activeVersion.status,
      operations: activeVersion.operations.map((op) => ({
        id: op.id,
        sequence: op.sequence,
        operationName: op.operationName,
        workCenter: op.workCenter,
        setupTimeMinutes: op.setupTimeMinutes,
        runTimePerUnitMinutes: op.runTimePerUnitMinutes,
        laborHoursPerUnit: op.laborHoursPerUnit,
        machineHoursPerUnit: op.machineHoursPerUnit,
        laborRate: defaultLaborRate,
      })),
    };
  }

  // 7. Query Plan Inputs for this product/plant/period
  const rawPlanInputs = await db.planInput.findMany({
    where: {
      organizationId,
      planVersionId,
      fiscalPeriodId,
      OR: [
        { plantId, productId },
        { plantId: null, productId: null },
        { plantId, productId: null },
        { inputCategory: 'OPEX' },
      ],
    },
  });

  const inputsMap: Record<string, SnapshotPlanInput> = {};
  const opexInputs: SnapshotPlanInput[] = [];

  for (const input of rawPlanInputs) {
    const snapshotInput: SnapshotPlanInput = {
      inputCategory: input.inputCategory,
      inputCode: input.inputCode,
      inputValue: input.inputValue,
      unitOfMeasure: input.unitOfMeasure,
      sourceType: input.sourceType,
      isOverridden: input.isOverridden,
      overrideReason: input.overrideReason,
      accountId: input.accountId,
    };

    if (input.inputCategory === 'OPEX') {
      opexInputs.push(snapshotInput);
    } else {
      inputsMap[input.inputCode] = snapshotInput;
    }
  }

  // 8. Query Assumptions
  const rawAssumptions = await db.assumption.findMany({
    where: {
      organizationId,
      planVersionId,
    },
  });

  const assumptionsMap: Record<string, SnapshotAssumption> = {};
  for (const a of rawAssumptions) {
    assumptionsMap[a.code] = {
      code: a.code,
      name: a.name,
      category: a.category,
      valueType: a.valueType,
      numericValue: a.numericValue,
      textValue: a.textValue,
      unit: a.unit,
    };
  }

  // 9. Query Drivers & Overrides
  const rawDrivers = await db.driver.findMany({
    where: { organizationId, isActive: true },
    include: {
      planValues: {
        where: { planVersionId },
      },
    },
  });

  const driversMap: Record<string, SnapshotDriver> = {};
  for (const d of rawDrivers) {
    const override = d.planValues[0];
    driversMap[d.driverCode] = {
      code: d.driverCode,
      name: d.driverName,
      category: d.driverCategory,
      value: override ? override.driverValue : d.defaultValue,
      unitOfMeasure: d.unitOfMeasure,
      isOverridden: override ? override.isOverridden : false,
      overrideReason: override ? override.overrideReason : null,
    };
  }

  // 10. Construct Normalized Payload & Hash
  const payloadData = {
    organizationId,
    planningCycleId,
    planVersionId,
    fiscalPeriodId,
    plantId,
    productId,
    currency: plant.baseCurrency || 'USD',
    periodDays,
    product: {
      id: product.id,
      code: product.code,
      name: product.name,
      standardPriceCents: product.standardPriceCents,
    },
    plant: {
      id: plant.id,
      code: plant.code,
      name: plant.name,
    },
    bom: snapshotBom,
    routing: snapshotRouting,
    inputs: inputsMap,
    opexInputs,
    assumptions: assumptionsMap,
    drivers: driversMap,
    metadata: {
      createdAt: new Date().toISOString(),
      versionName: planVersion.versionName,
      periodName: fiscalPeriod.periodName,
    },
  };

  const payloadString = JSON.stringify(payloadData);
  const snapshotHash = crypto.createHash('sha256').update(payloadString).digest('hex');
  const snapshotId = `snap_${snapshotHash.substring(0, 16)}`;

  return {
    snapshotId,
    snapshotHash,
    ...payloadData,
  };
}
