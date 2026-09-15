/**
 * Bill of Materials & Material Cost Calculation Stage
 */

import { CalculationStage, StageExecutionContext } from '../../domain/types/stage.types';
import { CalculationStageName, FinancialOutputCategory, ValidationSeverity } from '../../domain/enums';
import { dec } from '../../domain/decimal';
import { MaterialCostDetail } from '../../domain/types/output.types';

export class MaterialCostCalculationStage implements CalculationStage {
  public readonly name = CalculationStageName.MATERIAL_COSTING;
  public readonly dependencies = [CalculationStageName.PRODUCTION];

  public execute(ctx: StageExecutionContext): void {
    const { snapshot, context } = ctx;
    const currency = context.currency;
    const grossProduction = dec(ctx.results.grossProductionQuantity ?? 0);

    const drillDown: MaterialCostDetail[] = [];
    let totalMaterialCost = dec(0);

    const directMatInput = snapshot.inputs['MATERIAL_COST_PER_UNIT'];
    const bom = snapshot.bom;

    if (bom && bom.lines.length > 0) {
      // Calculate from BOM lines
      for (const line of bom.lines) {
        const qtyPerUnit = dec(line.quantityPerUnit);
        const scrapFactor = dec(1).plus(dec(line.scrapPercentage).dividedBy(100));
        const effectiveQty = qtyPerUnit.times(scrapFactor);
        const unitPrice = dec(line.unitPrice);

        if (unitPrice.isZero()) {
          ctx.validations.push({
            code: 'ZERO_MATERIAL_PRICE',
            severity: ValidationSeverity.WARNING,
            message: `Material ${line.materialCode} (${line.materialName}) has zero unit cost.`,
            calculationStage: this.name,
            entityType: 'MATERIAL',
            entityId: line.materialId,
            suggestedResolution: 'Update material defaultCostCents or provide price input.',
          });
        }

        const costPerUnit = effectiveQty.times(unitPrice);
        const extendedCost = grossProduction.times(costPerUnit);

        totalMaterialCost = totalMaterialCost.plus(extendedCost);

        drillDown.push({
          materialId: line.materialId,
          materialCode: line.materialCode,
          materialName: line.materialName,
          unitOfMeasure: line.unitOfMeasure,
          quantityPerUnit: qtyPerUnit.toNumber(),
          scrapPercentage: line.scrapPercentage,
          unitPrice: unitPrice.toDecimalPlaces(context.config.rounding.rateDecimals),
          costPerFinishedUnit: costPerUnit.toDecimalPlaces(context.config.rounding.currencyDecimals),
          extendedTotalCost: extendedCost.toDecimalPlaces(context.config.rounding.currencyDecimals),
        });
      }
    } else if (directMatInput && !isNaN(directMatInput.inputValue) && directMatInput.inputValue >= 0) {
      // Direct unit material cost input
      const unitMatCost = dec(directMatInput.inputValue);
      totalMaterialCost = grossProduction.times(unitMatCost);

      drillDown.push({
        materialId: 'DIRECT_INPUT',
        materialCode: 'DIRECT_MAT',
        materialName: 'Direct Unit Material Cost',
        unitOfMeasure: 'EA',
        quantityPerUnit: 1,
        scrapPercentage: 0,
        unitPrice: unitMatCost.toDecimalPlaces(context.config.rounding.rateDecimals),
        costPerFinishedUnit: unitMatCost.toDecimalPlaces(context.config.rounding.currencyDecimals),
        extendedTotalCost: totalMaterialCost.toDecimalPlaces(context.config.rounding.currencyDecimals),
      });
    } else {
      ctx.validations.push({
        code: 'MISSING_BOM_OR_MATERIAL_COST',
        severity: ValidationSeverity.ERROR,
        message: `No active BOM lines or 'MATERIAL_COST_PER_UNIT' input found for product ${snapshot.product.code}.`,
        calculationStage: this.name,
        entityType: 'PRODUCT',
        entityId: snapshot.product.id,
        suggestedResolution: 'Approve a BOM version for this product or enter a MATERIAL_COST_PER_UNIT plan input.',
      });
      return;
    }

    const matCostPerUnit = grossProduction.isPositive()
      ? totalMaterialCost.dividedBy(grossProduction)
      : dec(0);

    ctx.results.materialCost = totalMaterialCost.toDecimalPlaces(context.config.rounding.currencyDecimals);
    ctx.results.materialCostDrillDown = drillDown;

    ctx.outputs.push({
      category: FinancialOutputCategory.MATERIAL_COST,
      code: 'TOTAL_MATERIAL_COST',
      value: ctx.results.materialCost,
      unitOfMeasure: currency,
      currency,
      stage: this.name,
      formulaReference: 'Gross Production * Sum(Component Effective Qty * Unit Price)',
      sourceInputReferences: JSON.stringify({ componentsCount: drillDown.length, grossProduction: grossProduction.toNumber() }),
    });

    ctx.outputs.push({
      category: FinancialOutputCategory.MATERIAL_COST,
      code: 'MATERIAL_COST_PER_UNIT',
      value: matCostPerUnit.toDecimalPlaces(context.config.rounding.currencyDecimals),
      unitOfMeasure: currency,
      currency,
      stage: this.name,
      formulaReference: 'Total Material Cost / Gross Production',
      sourceInputReferences: JSON.stringify({ totalCost: ctx.results.materialCost }),
    });
  }
}
