/**
 * Calculation Stage Types
 */

import { CalculationContext } from './context.types';
import { InputSnapshot } from './snapshot.types';
import { OutputRecord, FinancialResultSummary } from './output.types';
import { ValidationErrorDetail } from '../errors';

export interface StageExecutionContext {
  context: CalculationContext;
  snapshot: InputSnapshot;
  // Accumulated intermediate and stage results
  results: Partial<FinancialResultSummary>;
  outputs: OutputRecord[];
  validations: ValidationErrorDetail[];
}

export interface CalculationStage {
  readonly name: string;
  readonly dependencies: string[];
  execute(ctx: StageExecutionContext): Promise<void> | void;
}
