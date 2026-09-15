/**
 * Calculation Context & Configuration Types
 */

import { RoundingMode } from '../decimal';

export interface RoundingConfig {
  currencyDecimals: number;       // default: 2
  quantityDecimals: number;       // default: 2
  rateDecimals: number;           // default: 4
  percentageDecimals: number;     // default: 4
  roundingMode: RoundingMode;     // default: 'HALF_UP'
}

export interface EngineConfig {
  engineVersion: string;
  allowNegativeProduction: boolean;
  workingCapitalDSO: number;      // Days Sales Outstanding (default: 45)
  workingCapitalDIO: number;      // Days Inventory Outstanding (default: 60)
  workingCapitalDPO: number;      // Days Payable Outstanding (default: 30)
  rounding: RoundingConfig;
}

export interface CalculationContext {
  organizationId: string;
  planningCycleId: string;
  planVersionId: string;
  fiscalPeriodId: string;
  plantId: string;
  productId: string;
  currency: string;
  calculationRunId: string;
  timestamp: Date;
  userId: string;
  config: EngineConfig;
}
