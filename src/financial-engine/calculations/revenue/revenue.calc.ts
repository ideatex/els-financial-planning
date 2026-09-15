/**
 * Gross Profit & Margin Calculation Stage
 */

import { CalculationStage, StageExecutionContext } from '../../domain/types/stage.types';
import { CalculationStageName, FinancialOutputCategory } from '../../domain/enums';
import { dec } from '../../domain/decimal';

export class RevenueProfitCalculationStage implements CalculationStage {
  public readonly name = CalculationStageName.REVENUE_PROFIT;
  public readonly dependencies = [
    CalculationStageName.DEMAND,
    CalculationStageName.COGM_COGS,
  ];

  public execute(ctx: StageExecutionContext): void {
    const { context } = ctx;
    const currency = context.currency;

    const revenue = dec(ctx.results.revenue ?? 0);
    const cogs = dec(ctx.results.cogs ?? 0);

    // Gross Profit = Revenue - COGS
    const grossProfit = revenue.minus(cogs);

    // Gross Margin % = (Gross Profit / Revenue) * 100
    let grossMarginPct = dec(0);
    if (revenue.isPositive()) {
      grossMarginPct = grossProfit.dividedBy(revenue).times(100);
    }

    ctx.results.grossProfit = grossProfit.toDecimalPlaces(context.config.rounding.currencyDecimals);
    ctx.results.grossMarginPercentage = grossMarginPct.toDecimalPlaces(context.config.rounding.percentageDecimals);

    ctx.outputs.push({
      category: FinancialOutputCategory.GROSS_PROFIT,
      code: 'GROSS_PROFIT',
      value: ctx.results.grossProfit,
      unitOfMeasure: currency,
      currency,
      stage: this.name,
      formulaReference: 'Revenue - COGS',
      sourceInputReferences: JSON.stringify({ revenue: ctx.results.revenue, cogs: ctx.results.cogs }),
    });

    ctx.outputs.push({
      category: FinancialOutputCategory.GROSS_PROFIT,
      code: 'GROSS_MARGIN_PERCENT',
      value: ctx.results.grossMarginPercentage,
      unitOfMeasure: '%',
      currency,
      stage: this.name,
      formulaReference: '(Gross Profit / Revenue) * 100',
      sourceInputReferences: JSON.stringify({ grossProfit: ctx.results.grossProfit, revenue: ctx.results.revenue }),
    });
  }
}
