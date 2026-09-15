/**
 * Demand & Revenue Calculation Stage
 */

import { CalculationStage, StageExecutionContext } from '../../domain/types/stage.types';
import { CalculationStageName, FinancialOutputCategory, ValidationSeverity } from '../../domain/enums';
import { dec } from '../../domain/decimal';

export class DemandCalculationStage implements CalculationStage {
  public readonly name = CalculationStageName.DEMAND;
  public readonly dependencies = [];

  public execute(ctx: StageExecutionContext): void {
    const { snapshot, context } = ctx;
    const currency = context.currency;

    // 1. Resolve Sales Quantity
    // Accept both SALES_VOLUME (engine canonical) and DEMAND_VOLUME (plan-input canonical) as aliases
    const salesInput = snapshot.inputs['SALES_VOLUME'] ?? snapshot.inputs['DEMAND_VOLUME'];
    if (!salesInput || isNaN(salesInput.inputValue)) {
      ctx.validations.push({
        code: 'MISSING_SALES_VOLUME',
        severity: ValidationSeverity.ERROR,
        message: `Required sales quantity input 'SALES_VOLUME' is missing for product ${snapshot.product.code}.`,
        calculationStage: this.name,
        entityType: 'PRODUCT',
        entityId: snapshot.product.id,
        field: 'SALES_VOLUME',
        suggestedResolution: 'Enter sales volume input in Planning Inputs grid or create a Demand Target.',
      });
      return;
    }

    const salesQuantity = dec(salesInput.inputValue);
    if (salesQuantity.isNegative()) {
      ctx.validations.push({
        code: 'NEGATIVE_SALES_VOLUME',
        severity: ValidationSeverity.ERROR,
        message: `Sales quantity cannot be negative (${salesQuantity.toNumber()}).`,
        calculationStage: this.name,
        entityType: 'PLAN_INPUT',
        field: 'SALES_VOLUME',
        suggestedResolution: 'Ensure sales quantity is zero or positive.',
      });
      return;
    }

    // 2. Resolve Selling Price
    let sellingPrice = dec(0);
    let priceSource = 'MANUAL';

    const priceInput = snapshot.inputs['SELLING_PRICE'];
    if (priceInput && !isNaN(priceInput.inputValue) && priceInput.inputValue > 0) {
      sellingPrice = dec(priceInput.inputValue);
      priceSource = priceInput.sourceType;
    } else if (snapshot.assumptions['SELLING_PRICE']?.numericValue) {
      sellingPrice = dec(snapshot.assumptions['SELLING_PRICE'].numericValue!);
      priceSource = 'ASSUMPTION';
    } else if (snapshot.product.standardPriceCents > 0) {
      sellingPrice = dec(snapshot.product.standardPriceCents).dividedBy(100);
      priceSource = 'PRODUCT_MASTER_DATA';
    } else {
      ctx.validations.push({
        code: 'MISSING_SELLING_PRICE',
        severity: ValidationSeverity.ERROR,
        message: `Selling price is not configured for product ${snapshot.product.code}.`,
        calculationStage: this.name,
        entityType: 'PRODUCT',
        entityId: snapshot.product.id,
        field: 'SELLING_PRICE',
        suggestedResolution: 'Provide a selling price in Plan Inputs, set a Pricing Assumption, or define standardPrice in Product master data.',
      });
      return;
    }

    // 3. Compute Gross Revenue
    const revenue = salesQuantity.times(sellingPrice);

    ctx.results.salesQuantity = salesQuantity.toDecimalPlaces(ctx.context.config.rounding.quantityDecimals);
    ctx.results.sellingPrice = sellingPrice.toDecimalPlaces(ctx.context.config.rounding.currencyDecimals);
    ctx.results.revenue = revenue.toDecimalPlaces(ctx.context.config.rounding.currencyDecimals);

    // Record outputs
    ctx.outputs.push({
      category: FinancialOutputCategory.DEMAND,
      code: 'PLANNED_SALES_QUANTITY',
      value: ctx.results.salesQuantity,
      unitOfMeasure: salesInput.unitOfMeasure || 'EA',
      currency,
      stage: this.name,
      formulaReference: 'SALES_VOLUME',
      sourceInputReferences: JSON.stringify({ source: salesInput.sourceType, code: 'SALES_VOLUME' }),
    });

    ctx.outputs.push({
      category: FinancialOutputCategory.DEMAND,
      code: 'PLANNED_SELLING_PRICE',
      value: ctx.results.sellingPrice,
      unitOfMeasure: currency,
      currency,
      stage: this.name,
      formulaReference: 'SELLING_PRICE',
      sourceInputReferences: JSON.stringify({ source: priceSource, code: 'SELLING_PRICE' }),
    });

    ctx.outputs.push({
      category: FinancialOutputCategory.REVENUE,
      code: 'GROSS_REVENUE',
      value: ctx.results.revenue,
      unitOfMeasure: currency,
      currency,
      stage: this.name,
      formulaReference: 'Units Sold * Selling Price',
      sourceInputReferences: JSON.stringify({ salesQuantity: ctx.results.salesQuantity, sellingPrice: ctx.results.sellingPrice }),
    });
  }
}
