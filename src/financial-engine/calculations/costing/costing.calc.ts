/**
 * Standard Unit Cost Calculation Stage
 */

import { CalculationStage, StageExecutionContext } from '../../domain/types/stage.types';
import { CalculationStageName, FinancialOutputCategory } from '../../domain/enums';
import { dec } from '../../domain/decimal';

export class StandardCostCalculationStage implements CalculationStage {
  public readonly name = CalculationStageName.STANDARD_COSTING;
  public readonly dependencies = [
    CalculationStageName.MATERIAL_COSTING,
    CalculationStageName.LABOR_COSTING,
    CalculationStageName.OVERHEAD_COSTING,
  ];

  public execute(ctx: StageExecutionContext): void {
    const { context } = ctx;
    const currency = context.currency;
    const grossProduction = dec(ctx.results.grossProductionQuantity ?? 0);

    const materialTotal = dec(ctx.results.materialCost ?? 0);
    const laborTotal = dec(ctx.results.laborCost ?? 0);
    const overheadTotal = dec(ctx.results.overheadCost ?? 0);

    let unitMaterial: ReturnType<typeof dec>;
    let unitLabor: ReturnType<typeof dec>;
    let unitOverhead: ReturnType<typeof dec>;

    if (grossProduction.isPositive()) {
      unitMaterial = materialTotal.dividedBy(grossProduction);
      unitLabor = laborTotal.dividedBy(grossProduction);
      unitOverhead = overheadTotal.dividedBy(grossProduction);
    } else {
      // Direct sum from drilldowns if production is zero
      const matUnitSum = ctx.results.materialCostDrillDown?.reduce((sum, item) => sum + item.costPerFinishedUnit, 0) ?? 0;
      const labUnitSum = ctx.results.laborCostDrillDown?.reduce((sum, item) => sum + item.costPerFinishedUnit, 0) ?? 0;
      unitMaterial = dec(matUnitSum);
      unitLabor = dec(labUnitSum);
      unitOverhead = dec(ctx.results.overheadDrillDown?.overheadRatePerUnit ?? 0);
    }

    const standardUnitCost = unitMaterial.plus(unitLabor).plus(unitOverhead);

    ctx.results.standardUnitCost = standardUnitCost.toDecimalPlaces(context.config.rounding.currencyDecimals);

    ctx.outputs.push({
      category: FinancialOutputCategory.STANDARD_COST,
      code: 'STANDARD_UNIT_COST',
      value: ctx.results.standardUnitCost,
      unitOfMeasure: currency,
      currency,
      stage: this.name,
      formulaReference: 'Material Cost/Unit + Labor Cost/Unit + Overhead Cost/Unit',
      sourceInputReferences: JSON.stringify({
        materialCostPerUnit: unitMaterial.toDecimalPlaces(context.config.rounding.currencyDecimals),
        laborCostPerUnit: unitLabor.toDecimalPlaces(context.config.rounding.currencyDecimals),
        overheadCostPerUnit: unitOverhead.toDecimalPlaces(context.config.rounding.currencyDecimals),
      }),
    });
  }
}
