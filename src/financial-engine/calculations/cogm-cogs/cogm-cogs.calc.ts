/**
 * Cost of Goods Manufactured (COGM) & Cost of Goods Sold (COGS) Stage
 */

import { CalculationStage, StageExecutionContext } from '../../domain/types/stage.types';
import { CalculationStageName, FinancialOutputCategory } from '../../domain/enums';
import { dec } from '../../domain/decimal';

export class CogmCogsCalculationStage implements CalculationStage {
  public readonly name = CalculationStageName.COGM_COGS;
  public readonly dependencies = [
    CalculationStageName.STANDARD_COSTING,
    CalculationStageName.DEMAND,
  ];

  public execute(ctx: StageExecutionContext): void {
    const { context } = ctx;
    const currency = context.currency;

    const materialTotal = dec(ctx.results.materialCost ?? 0);
    const laborTotal = dec(ctx.results.laborCost ?? 0);
    const overheadTotal = dec(ctx.results.overheadCost ?? 0);
    const salesQuantity = dec(ctx.results.salesQuantity ?? 0);
    const standardUnitCost = dec(ctx.results.standardUnitCost ?? 0);

    // 1. Cost of Goods Manufactured (Total Production Cost)
    const cogm = materialTotal.plus(laborTotal).plus(overheadTotal);

    // 2. Cost of Goods Sold (Simplified Standard-Cost Model)
    // COGS = Units Sold * Standard Unit Cost
    const cogs = salesQuantity.times(standardUnitCost);

    ctx.results.totalProductionCost = cogm.toDecimalPlaces(context.config.rounding.currencyDecimals);
    ctx.results.cogs = cogs.toDecimalPlaces(context.config.rounding.currencyDecimals);

    ctx.outputs.push({
      category: FinancialOutputCategory.COGM,
      code: 'TOTAL_PRODUCTION_COST',
      value: ctx.results.totalProductionCost,
      unitOfMeasure: currency,
      currency,
      stage: this.name,
      formulaReference: 'Total Material Cost + Total Labor Cost + Total Overhead Cost',
      sourceInputReferences: JSON.stringify({
        material: ctx.results.materialCost,
        labor: ctx.results.laborCost,
        overhead: ctx.results.overheadCost,
      }),
    });

    ctx.outputs.push({
      category: FinancialOutputCategory.COGS,
      code: 'COST_OF_GOODS_SOLD',
      value: ctx.results.cogs,
      unitOfMeasure: currency,
      currency,
      stage: this.name,
      formulaReference: 'Units Sold * Standard Unit Cost',
      sourceInputReferences: JSON.stringify({
        unitsSold: ctx.results.salesQuantity,
        standardUnitCost: ctx.results.standardUnitCost,
      }),
    });
  }
}
