/**
 * Manufacturing Overhead Calculation Stage
 */

import { CalculationStage, StageExecutionContext } from '../../domain/types/stage.types';
import { CalculationStageName, FinancialOutputCategory } from '../../domain/enums';
import { dec } from '../../domain/decimal';
import { OverheadDetail } from '../../domain/types/output.types';

export class OverheadCalculationStage implements CalculationStage {
  public readonly name = CalculationStageName.OVERHEAD_COSTING;
  public readonly dependencies = [CalculationStageName.PRODUCTION];

  public execute(ctx: StageExecutionContext): void {
    const { snapshot, context } = ctx;
    const currency = context.currency;
    const grossProduction = dec(ctx.results.grossProductionQuantity ?? 0);

    // 1. Check unit rate input
    const unitRateInput = snapshot.inputs['OVERHEAD_COST_PER_UNIT'] ?? snapshot.inputs['OVERHEAD_RATE'];
    // 2. Check fixed overhead input
    const fixedInput = snapshot.inputs['FIXED_OVERHEAD'];

    let unitRate = dec(0);
    let fixedAmount = dec(0);
    let method: 'UNIT_RATE' | 'FIXED_ALLOCATION' = 'UNIT_RATE';

    if (unitRateInput && !isNaN(unitRateInput.inputValue)) {
      unitRate = dec(unitRateInput.inputValue);
      method = 'UNIT_RATE';
    }

    if (fixedInput && !isNaN(fixedInput.inputValue)) {
      fixedAmount = dec(fixedInput.inputValue);
      if (unitRate.isZero()) {
        method = 'FIXED_ALLOCATION';
      }
    }

    // Extended Overhead Cost = (Gross Production * Unit Rate) + Fixed Amount
    const variableOverhead = grossProduction.times(unitRate);
    const totalOverhead = variableOverhead.plus(fixedAmount);

    const overheadCostPerUnit = grossProduction.isPositive()
      ? totalOverhead.dividedBy(grossProduction)
      : dec(0);

    const drillDown: OverheadDetail = {
      method,
      overheadRatePerUnit: unitRate.toDecimalPlaces(context.config.rounding.rateDecimals),
      fixedOverheadAmount: fixedAmount.toDecimalPlaces(context.config.rounding.currencyDecimals),
      extendedTotalCost: totalOverhead.toDecimalPlaces(context.config.rounding.currencyDecimals),
    };

    ctx.results.overheadCost = totalOverhead.toDecimalPlaces(context.config.rounding.currencyDecimals);
    ctx.results.overheadDrillDown = drillDown;

    ctx.outputs.push({
      category: FinancialOutputCategory.OVERHEAD,
      code: 'TOTAL_OVERHEAD_COST',
      value: ctx.results.overheadCost,
      unitOfMeasure: currency,
      currency,
      stage: this.name,
      formulaReference: '(Gross Production * Overhead Rate per Unit) + Fixed Overhead',
      sourceInputReferences: JSON.stringify({ unitRate: unitRate.toNumber(), fixedAmount: fixedAmount.toNumber() }),
    });

    ctx.outputs.push({
      category: FinancialOutputCategory.OVERHEAD,
      code: 'OVERHEAD_COST_PER_UNIT',
      value: overheadCostPerUnit.toDecimalPlaces(context.config.rounding.currencyDecimals),
      unitOfMeasure: currency,
      currency,
      stage: this.name,
      formulaReference: 'Total Overhead Cost / Gross Production',
    });
  }
}
