/**
 * Calculation Context Builder
 */

import { CalculationContext, EngineConfig } from '../domain/types/context.types';

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  engineVersion: '1.0.0',
  allowNegativeProduction: false,
  workingCapitalDSO: 45,
  workingCapitalDIO: 60,
  workingCapitalDPO: 30,
  rounding: {
    currencyDecimals: 2,
    quantityDecimals: 2,
    rateDecimals: 4,
    percentageDecimals: 4,
    roundingMode: 'HALF_UP',
  },
};

export interface CreateContextOptions {
  organizationId: string;
  planningCycleId: string;
  planVersionId: string;
  fiscalPeriodId: string;
  plantId: string;
  productId: string;
  currency?: string;
  calculationRunId?: string;
  userId: string;
  config?: Partial<EngineConfig>;
}

export function createCalculationContext(options: CreateContextOptions): CalculationContext {
  return {
    organizationId: options.organizationId,
    planningCycleId: options.planningCycleId,
    planVersionId: options.planVersionId,
    fiscalPeriodId: options.fiscalPeriodId,
    plantId: options.plantId,
    productId: options.productId,
    currency: options.currency || 'USD',
    calculationRunId: options.calculationRunId || `run-${Date.now()}`,
    timestamp: new Date(),
    userId: options.userId,
    config: {
      ...DEFAULT_ENGINE_CONFIG,
      ...options.config,
      rounding: {
        ...DEFAULT_ENGINE_CONFIG.rounding,
        ...options.config?.rounding,
      },
    },
  };
}
