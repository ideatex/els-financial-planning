/**
 * Financial Engine Domain Enums & Constants
 */

export const CalculationRunStatus = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  COMPLETED_WITH_WARNINGS: 'COMPLETED_WITH_WARNINGS',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

export type CalculationRunStatus = (typeof CalculationRunStatus)[keyof typeof CalculationRunStatus];

export const ValidationSeverity = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL',
} as const;

export type ValidationSeverity = (typeof ValidationSeverity)[keyof typeof ValidationSeverity];

export const FinancialOutputCategory = {
  DEMAND: 'DEMAND',
  PRODUCTION: 'PRODUCTION',
  MATERIAL_COST: 'MATERIAL_COST',
  LABOR_COST: 'LABOR_COST',
  OVERHEAD: 'OVERHEAD',
  STANDARD_COST: 'STANDARD_COST',
  COGM: 'COGM',
  COGS: 'COGS',
  REVENUE: 'REVENUE',
  GROSS_PROFIT: 'GROSS_PROFIT',
  OPEX: 'OPEX',
  OPERATING_PROFIT: 'OPERATING_PROFIT',
  WORKING_CAPITAL: 'WORKING_CAPITAL',
  CASH_FLOW: 'CASH_FLOW',
  BALANCE_SHEET: 'BALANCE_SHEET',
} as const;

export type FinancialOutputCategory = (typeof FinancialOutputCategory)[keyof typeof FinancialOutputCategory];

export const CalculationStageName = {
  DEMAND: 'DEMAND',
  PRODUCTION: 'PRODUCTION',
  BOM_RESOLUTION: 'BOM_RESOLUTION',
  MATERIAL_COSTING: 'MATERIAL_COSTING',
  ROUTING_RESOLUTION: 'ROUTING_RESOLUTION',
  LABOR_COSTING: 'LABOR_COSTING',
  OVERHEAD_COSTING: 'OVERHEAD_COSTING',
  STANDARD_COSTING: 'STANDARD_COSTING',
  COGM_COGS: 'COGM_COGS',
  REVENUE_PROFIT: 'REVENUE_PROFIT',
  OPEX_AGGREGATION: 'OPEX_AGGREGATION',
  WORKING_CAPITAL: 'WORKING_CAPITAL',
  CASH_FLOW: 'CASH_FLOW',
  BALANCE_SHEET: 'BALANCE_SHEET',
  INTEGRITY_VALIDATION: 'INTEGRITY_VALIDATION',
} as const;

export type CalculationStageName = (typeof CalculationStageName)[keyof typeof CalculationStageName];
