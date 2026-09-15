/**
 * Routing & Labor Cost Calculation Stage
 */

import { CalculationStage, StageExecutionContext } from '../../domain/types/stage.types';
import { CalculationStageName, FinancialOutputCategory, ValidationSeverity } from '../../domain/enums';
import { dec } from '../../domain/decimal';
import { LaborCostDetail } from '../../domain/types/output.types';

export class LaborCostCalculationStage implements CalculationStage {
  public readonly name = CalculationStageName.LABOR_COSTING;
  public readonly dependencies = [CalculationStageName.PRODUCTION];

  public execute(ctx: StageExecutionContext): void {
    const { snapshot, context } = ctx;
    const currency = context.currency;
    const grossProduction = dec(ctx.results.grossProductionQuantity ?? 0);

    const drillDown: LaborCostDetail[] = [];
    let totalLaborCost = dec(0);

    const routing = snapshot.routing;
    const directHoursInput = snapshot.inputs['LABOR_HOURS_PER_UNIT'];
    const directRateInput = snapshot.inputs['LABOR_RATE'] ?? snapshot.inputs['LABOR_HOURLY_RATE'];
    const directCostInput = snapshot.inputs['LABOR_COST_PER_UNIT'];

    if (routing && routing.operations.length > 0) {
      // Calculate from Routing operations
      for (const op of routing.operations) {
        const laborHours = dec(op.laborHoursPerUnit);
        const laborRate = dec(op.laborRate);

        if (laborRate.isZero()) {
          ctx.validations.push({
            code: 'ZERO_LABOR_RATE',
            severity: ValidationSeverity.WARNING,
            message: `Operation '${op.operationName}' (Seq ${op.sequence}) has zero labor rate.`,
            calculationStage: this.name,
            entityType: 'ROUTING_OPERATION',
            entityId: op.id,
            suggestedResolution: 'Set labor hourly wage rate in plan inputs or driver library.',
          });
        }

        const costPerUnit = laborHours.times(laborRate);
        const extendedCost = grossProduction.times(costPerUnit);

        totalLaborCost = totalLaborCost.plus(extendedCost);

        drillDown.push({
          operationId: op.id,
          sequence: op.sequence,
          operationName: op.operationName,
          workCenter: op.workCenter,
          laborHoursPerUnit: laborHours.toDecimalPlaces(context.config.rounding.rateDecimals),
          laborRate: laborRate.toDecimalPlaces(context.config.rounding.rateDecimals),
          costPerFinishedUnit: costPerUnit.toDecimalPlaces(context.config.rounding.currencyDecimals),
          extendedTotalCost: extendedCost.toDecimalPlaces(context.config.rounding.currencyDecimals),
        });
      }
    } else if (directHoursInput && directRateInput) {
      // Direct hours and rate inputs
      const laborHours = dec(directHoursInput.inputValue);
      const laborRate = dec(directRateInput.inputValue);
      const costPerUnit = laborHours.times(laborRate);
      totalLaborCost = grossProduction.times(costPerUnit);

      drillDown.push({
        operationId: 'DIRECT_INPUT',
        sequence: 10,
        operationName: 'Direct Assembly & Production Labor',
        workCenter: 'WC-PRIMARY',
        laborHoursPerUnit: laborHours.toDecimalPlaces(context.config.rounding.rateDecimals),
        laborRate: laborRate.toDecimalPlaces(context.config.rounding.rateDecimals),
        costPerFinishedUnit: costPerUnit.toDecimalPlaces(context.config.rounding.currencyDecimals),
        extendedTotalCost: totalLaborCost.toDecimalPlaces(context.config.rounding.currencyDecimals),
      });
    } else if (directCostInput) {
      // Direct unit cost input
      const costPerUnit = dec(directCostInput.inputValue);
      totalLaborCost = grossProduction.times(costPerUnit);

      drillDown.push({
        operationId: 'DIRECT_INPUT',
        sequence: 10,
        operationName: 'Direct Labor Cost',
        workCenter: 'WC-PRIMARY',
        laborHoursPerUnit: 1,
        laborRate: costPerUnit.toDecimalPlaces(context.config.rounding.rateDecimals),
        costPerFinishedUnit: costPerUnit.toDecimalPlaces(context.config.rounding.currencyDecimals),
        extendedTotalCost: totalLaborCost.toDecimalPlaces(context.config.rounding.currencyDecimals),
      });
    } else {
      ctx.validations.push({
        code: 'MISSING_ROUTING_OR_LABOR_INPUTS',
        severity: ValidationSeverity.ERROR,
        message: `No active routing operations or 'LABOR_HOURS_PER_UNIT'/'LABOR_RATE' inputs found for product ${snapshot.product.code}.`,
        calculationStage: this.name,
        entityType: 'PRODUCT',
        entityId: snapshot.product.id,
        suggestedResolution: 'Approve a routing version or provide direct labor hours and hourly rate plan inputs.',
      });
      return;
    }

    const laborCostPerUnit = grossProduction.isPositive()
      ? totalLaborCost.dividedBy(grossProduction)
      : dec(0);

    ctx.results.laborCost = totalLaborCost.toDecimalPlaces(context.config.rounding.currencyDecimals);
    ctx.results.laborCostDrillDown = drillDown;

    ctx.outputs.push({
      category: FinancialOutputCategory.LABOR_COST,
      code: 'TOTAL_LABOR_COST',
      value: ctx.results.laborCost,
      unitOfMeasure: currency,
      currency,
      stage: this.name,
      formulaReference: 'Gross Production * Sum(Operation Labor Hours * Labor Rate)',
      sourceInputReferences: JSON.stringify({ operationsCount: drillDown.length, grossProduction: grossProduction.toNumber() }),
    });

    ctx.outputs.push({
      category: FinancialOutputCategory.LABOR_COST,
      code: 'LABOR_COST_PER_UNIT',
      value: laborCostPerUnit.toDecimalPlaces(context.config.rounding.currencyDecimals),
      unitOfMeasure: currency,
      currency,
      stage: this.name,
      formulaReference: 'Total Labor Cost / Gross Production',
      sourceInputReferences: JSON.stringify({ totalCost: ctx.results.laborCost }),
    });
  }
}
