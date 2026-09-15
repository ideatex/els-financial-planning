/**
 * Financial Output Types & Codes
 */

import { FinancialOutputCategory } from '../enums';

export interface OutputRecord {
  category: FinancialOutputCategory;
  code: string;
  value: number;
  unitOfMeasure: string;
  currency: string;
  stage: string;
  formulaReference?: string;
  sourceInputReferences?: string; // JSON string
  lineage?: string; // JSON string
  accountId?: string | null;
}

export interface MaterialCostDetail {
  materialId: string;
  materialCode: string;
  materialName: string;
  unitOfMeasure: string;
  quantityPerUnit: number;
  scrapPercentage: number;
  unitPrice: number;
  costPerFinishedUnit: number;
  extendedTotalCost: number;
}

export interface LaborCostDetail {
  operationId: string;
  sequence: number;
  operationName: string;
  workCenter: string;
  laborHoursPerUnit: number;
  laborRate: number;
  costPerFinishedUnit: number;
  extendedTotalCost: number;
}

export interface OverheadDetail {
  method: 'UNIT_RATE' | 'FIXED_ALLOCATION';
  overheadRatePerUnit: number;
  fixedOverheadAmount: number;
  extendedTotalCost: number;
}

export interface OpexAccountDetail {
  accountId: string;
  accountCode: string;
  accountName: string;
  plannedAmount: number;
}

export interface FinancialResultSummary {
  salesQuantity: number;
  sellingPrice: number;
  revenue: number;
  beginningInventory: number;
  targetEndingInventory: number;
  netProductionQuantity: number;
  grossProductionQuantity: number;
  scrapQuantity: number;
  materialCost: number;
  laborCost: number;
  overheadCost: number;
  totalProductionCost: number; // COGM
  standardUnitCost: number;
  cogs: number;
  grossProfit: number;
  grossMarginPercentage: number;
  totalOpex: number;
  operatingProfit: number;
  operatingMarginPercentage: number;
  accountsReceivable: number;
  inventoryValue: number;
  accountsPayable: number;
  netWorkingCapital: number;
  operatingCashFlow: number;
  netChangeInCash: number;
  closingCash: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  balanceSheetImbalance: number;
  materialCostDrillDown: MaterialCostDetail[];
  laborCostDrillDown: LaborCostDetail[];
  overheadDrillDown: OverheadDetail;
  opexDrillDown: OpexAccountDetail[];
}
