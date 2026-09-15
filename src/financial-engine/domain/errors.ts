/**
 * Financial Engine Domain Errors
 */

import { ValidationSeverity } from './enums';

export class CalculationEngineError extends Error {
  public readonly code: string;
  public readonly stage?: string;

  constructor(message: string, code = 'ENGINE_ERROR', stage?: string) {
    super(message);
    this.name = 'CalculationEngineError';
    this.code = code;
    this.stage = stage;
  }
}

export interface ValidationErrorDetail {
  code: string;
  severity: ValidationSeverity;
  message: string;
  calculationStage: string;
  entityType?: string;
  entityId?: string;
  field?: string;
  suggestedResolution?: string;
}

export class CalculationValidationError extends CalculationEngineError {
  public readonly validations: ValidationErrorDetail[];

  constructor(message: string, validations: ValidationErrorDetail[], stage?: string) {
    super(message, 'CALCULATION_VALIDATION_FAILED', stage);
    this.name = 'CalculationValidationError';
    this.validations = validations;
  }
}

export class MissingInputError extends CalculationEngineError {
  public readonly inputCode: string;
  public readonly entityType: string;

  constructor(inputCode: string, entityType = 'PLAN_INPUT', stage?: string) {
    super(`Required input '${inputCode}' is missing for ${entityType}`, 'MISSING_REQUIRED_INPUT', stage);
    this.name = 'MissingInputError';
    this.inputCode = inputCode;
    this.entityType = entityType;
  }
}

export class PlanLockedError extends CalculationEngineError {
  constructor(versionId: string, status: string) {
    super(`Cannot run calculation on plan version '${versionId}' with immutable status '${status}'`, 'PLAN_VERSION_LOCKED');
    this.name = 'PlanLockedError';
  }
}
