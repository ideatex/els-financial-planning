/**
 * Input Snapshot Types
 */

export interface SnapshotBomLine {
  id: string;
  materialId: string;
  materialCode: string;
  materialName: string;
  quantityPerUnit: number;
  unitOfMeasure: string;
  scrapPercentage: number;
  unitPrice: number; // resolved unit cost in currency
}

export interface SnapshotBom {
  headerId: string;
  versionId: string;
  versionNumber: number;
  status: string;
  lines: SnapshotBomLine[];
}

export interface SnapshotRoutingOperation {
  id: string;
  sequence: number;
  operationName: string;
  workCenter: string;
  setupTimeMinutes: number;
  runTimePerUnitMinutes: number;
  laborHoursPerUnit: number;
  machineHoursPerUnit: number;
  laborRate: number; // resolved hourly rate
}

export interface SnapshotRouting {
  headerId: string;
  versionId: string;
  versionNumber: number;
  status: string;
  operations: SnapshotRoutingOperation[];
}

export interface SnapshotPlanInput {
  inputCategory: string;
  inputCode: string;
  inputValue: number;
  unitOfMeasure: string;
  sourceType: string;
  isOverridden: boolean;
  overrideReason?: string | null;
  accountId?: string | null;
}

export interface SnapshotAssumption {
  code: string;
  name: string;
  category: string;
  valueType: string;
  numericValue?: number | null;
  textValue?: string | null;
  unit?: string | null;
}

export interface SnapshotDriver {
  code: string;
  name: string;
  category: string;
  value: number;
  unitOfMeasure: string;
  isOverridden: boolean;
  overrideReason?: string | null;
}

export interface InputSnapshot {
  snapshotId: string;
  snapshotHash: string;
  organizationId: string;
  planningCycleId: string;
  planVersionId: string;
  fiscalPeriodId: string;
  plantId: string;
  productId: string;
  currency: string;
  periodDays: number; // days in the fiscal period
  product: {
    id: string;
    code: string;
    name: string;
    standardPriceCents: number;
  };
  plant: {
    id: string;
    code: string;
    name: string;
  };
  bom: SnapshotBom | null;
  routing: SnapshotRouting | null;
  inputs: Record<string, SnapshotPlanInput>;
  opexInputs: SnapshotPlanInput[]; // list of OPEX inputs across accounts
  assumptions: Record<string, SnapshotAssumption>;
  drivers: Record<string, SnapshotDriver>;
  metadata: {
    createdAt: string;
    versionName: string;
    periodName: string;
  };
}
