/**
 * Production Planning Calculation Stage
 */

import { CalculationStage, StageExecutionContext } from '../../domain/types/stage.types';
import { CalculationStageName, FinancialOutputCategory, ValidationSeverity } from '../../domain/enums';
import { dec } from '../../domain/decimal';

export class ProductionCalculationStage implements CalculationStage {
  public readonly name = CalculationStageName.PRODUCTION;
  public readonly dependencies = [CalculationStageName.DEMAND];

  public execute(ctx: StageExecutionContext): void {
    const { snapshot, context } = ctx;
    const currency = context.currency;

    const salesQuantity = dec(ctx.results.salesQuantity ?? 0);

    // 1. Resolve Inventory Levels
    const begInvInput = snapshot.inputs['BEGINNING_INVENTORY'];
    const beginningInventory = dec(begInvInput?.inputValue ?? 0);

    const endInvInput = snapshot.inputs['TARGET_ENDING_INVENTORY'];
    const targetEndingInventory = dec(endInvInput?.inputValue ?? 0);

    // 2. Resolve Scrap / Yield Drivers
    let scrapPercentage = dec(0);
    const scrapInput = snapshot.inputs['SCRAP_PCT'];
    if (scrapInput && !isNaN(scrapInput.inputValue)) {
      scrapPercentage = dec(scrapInput.inputValue);
    } else if (snapshot.drivers['DRV-SCRAP-01']) {
      scrapPercentage = dec(snapshot.drivers['DRV-SCRAP-01'].value);
    }

    let yieldPercentage = dec(100);
    const yieldInput = snapshot.inputs['YIELD_PCT'];
    if (yieldInput && !isNaN(yieldInput.inputValue) && yieldInput.inputValue > 0) {
      yieldPercentage = dec(yieldInput.inputValue);
    }

    // 3. Compute Net / Required Good Production
    // Net Production = Sales + Ending Inventory - Beginning Inventory
    let netProduction: ReturnType<typeof dec>;
    const manualProdInput = snapshot.inputs['PRODUCTION_VOLUME'];

    if (manualProdInput && manualProdInput.isOverridden && manualProdInput.inputValue >= 0) {
      netProduction = dec(manualProdInput.inputValue);
      ctx.validations.push({
        code: 'MANUAL_PRODUCTION_OVERRIDE',
        severity: ValidationSeverity.INFO,
        message: `Using manual production quantity override of ${netProduction.toNumber()} units. Reason: ${manualProdInput.overrideReason || 'N/A'}`,
        calculationStage: this.name,
        entityType: 'PLAN_INPUT',
        field: 'PRODUCTION_VOLUME',
      });
    } else {
      netProduction = salesQuantity.plus(targetEndingInventory).minus(beginningInventory);
    }

    // Validation: Negative production guard
    if (netProduction.isNegative()) {
      if (context.config.allowNegativeProduction) {
        ctx.validations.push({
          code: 'NEGATIVE_PRODUCTION_ALLOWED',
          severity: ValidationSeverity.WARNING,
          message: `Required production quantity is negative (${netProduction.toNumber()}) due to excess beginning inventory.`,
          calculationStage: this.name,
          entityType: 'PRODUCTION',
          suggestedResolution: 'Verify beginning inventory and target ending inventory values.',
        });
      } else {
        ctx.validations.push({
          code: 'NEGATIVE_PRODUCTION_PROHIBITED',
          severity: ValidationSeverity.ERROR,
          message: `Calculated production quantity cannot be negative (${netProduction.toNumber()}). Sales (${salesQuantity.toNumber()}) + End (${targetEndingInventory.toNumber()}) < Beg (${beginningInventory.toNumber()}).`,
          calculationStage: this.name,
          entityType: 'PRODUCTION',
          suggestedResolution: 'Adjust beginning inventory or planned sales.',
        });
        return;
      }
    }

    // 4. Compute Scrap and Gross Production
    // Apply yield or scrap (do not apply both simultaneously to avoid double counting)
    let grossProduction = netProduction;
    let scrapQuantity = dec(0);

    if (scrapPercentage.greaterThan(0)) {
      // Gross = Net * (1 + scrap%)
      const scrapFactor = scrapPercentage.dividedBy(100);
      scrapQuantity = netProduction.times(scrapFactor);
      grossProduction = netProduction.plus(scrapQuantity);
    } else if (yieldPercentage.lessThan(100) && yieldPercentage.greaterThan(0)) {
      // Gross = Net / (yield% / 100)
      const yieldFactor = yieldPercentage.dividedBy(100);
      grossProduction = netProduction.dividedBy(yieldFactor);
      scrapQuantity = grossProduction.minus(netProduction);
    }

    const qDecimals = context.config.rounding.quantityDecimals;
    ctx.results.beginningInventory = beginningInventory.toDecimalPlaces(qDecimals);
    ctx.results.targetEndingInventory = targetEndingInventory.toDecimalPlaces(qDecimals);
    ctx.results.netProductionQuantity = netProduction.toDecimalPlaces(qDecimals);
    ctx.results.scrapQuantity = scrapQuantity.toDecimalPlaces(qDecimals);
    ctx.results.grossProductionQuantity = grossProduction.toDecimalPlaces(qDecimals);

    // Record outputs
    ctx.outputs.push({
      category: FinancialOutputCategory.PRODUCTION,
      code: 'BEGINNING_INVENTORY',
      value: ctx.results.beginningInventory,
      unitOfMeasure: 'EA',
      currency,
      stage: this.name,
      formulaReference: 'BEGINNING_INVENTORY',
    });

    ctx.outputs.push({
      category: FinancialOutputCategory.PRODUCTION,
      code: 'TARGET_ENDING_INVENTORY',
      value: ctx.results.targetEndingInventory,
      unitOfMeasure: 'EA',
      currency,
      stage: this.name,
      formulaReference: 'TARGET_ENDING_INVENTORY',
    });

    ctx.outputs.push({
      category: FinancialOutputCategory.PRODUCTION,
      code: 'NET_PRODUCTION_QUANTITY',
      value: ctx.results.netProductionQuantity,
      unitOfMeasure: 'EA',
      currency,
      stage: this.name,
      formulaReference: 'Units Sold + Target Ending Inv - Beginning Inv',
      sourceInputReferences: JSON.stringify({
        sales: ctx.results.salesQuantity,
        endingInv: ctx.results.targetEndingInventory,
        begInv: ctx.results.beginningInventory,
      }),
    });

    ctx.outputs.push({
      category: FinancialOutputCategory.PRODUCTION,
      code: 'GROSS_PRODUCTION_QUANTITY',
      value: ctx.results.grossProductionQuantity,
      unitOfMeasure: 'EA',
      currency,
      stage: this.name,
      formulaReference: 'Net Production + Scrap Quantity',
      sourceInputReferences: JSON.stringify({
        netProduction: ctx.results.netProductionQuantity,
        scrapQuantity: ctx.results.scrapQuantity,
      }),
    });
  }
}
