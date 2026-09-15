/**
 * Operating Expenses (Opex) & Operating Profit Stage
 */

import { CalculationStage, StageExecutionContext } from '../../domain/types/stage.types';
import { CalculationStageName, FinancialOutputCategory } from '../../domain/enums';
import { dec } from '../../domain/decimal';
import { OpexAccountDetail } from '../../domain/types/output.types';

export class OpexCalculationStage implements CalculationStage {
  public readonly name = CalculationStageName.OPEX_AGGREGATION;
  public readonly dependencies = [CalculationStageName.REVENUE_PROFIT];

  public execute(ctx: StageExecutionContext): void {
    const { snapshot, context } = ctx;
    const currency = context.currency;

    const opexDrillDown: OpexAccountDetail[] = [];
    let totalOpex = dec(0);

    // 1. Process Opex line items if present
    if (snapshot.opexInputs && snapshot.opexInputs.length > 0) {
      for (const item of snapshot.opexInputs) {
        const amt = dec(item.inputValue);
        totalOpex = totalOpex.plus(amt);

        opexDrillDown.push({
          accountId: item.accountId || 'OPEX_ACCOUNT',
          accountCode: item.inputCode,
          accountName: item.inputCode.replace(/_/g, ' '),
          plannedAmount: amt.toDecimalPlaces(context.config.rounding.currencyDecimals),
        });
      }
    } else {
      // Direct opex input fallback (e.g. MONTHLY_OPEX or OPEX_PLANNED_AMOUNT)
      const directOpex = snapshot.inputs['MONTHLY_OPEX'] ?? snapshot.inputs['OPEX_PLANNED_AMOUNT'];
      if (directOpex && !isNaN(directOpex.inputValue)) {
        const amt = dec(directOpex.inputValue);
        totalOpex = amt;

        opexDrillDown.push({
          accountId: directOpex.accountId || 'GENERAL_OPEX',
          accountCode: directOpex.inputCode,
          accountName: 'General & Administrative Operating Expenses',
          plannedAmount: amt.toDecimalPlaces(context.config.rounding.currencyDecimals),
        });
      }
    }

    // 2. Operating Profit (EBIT) = Gross Profit - Total Opex
    const grossProfit = dec(ctx.results.grossProfit ?? 0);
    const revenue = dec(ctx.results.revenue ?? 0);
    const operatingProfit = grossProfit.minus(totalOpex);

    // 3. Operating Margin % = (Operating Profit / Revenue) * 100
    let operatingMarginPct = dec(0);
    if (revenue.isPositive()) {
      operatingMarginPct = operatingProfit.dividedBy(revenue).times(100);
    }

    ctx.results.totalOpex = totalOpex.toDecimalPlaces(context.config.rounding.currencyDecimals);
    ctx.results.operatingProfit = operatingProfit.toDecimalPlaces(context.config.rounding.currencyDecimals);
    ctx.results.operatingMarginPercentage = operatingMarginPct.toDecimalPlaces(context.config.rounding.percentageDecimals);
    ctx.results.opexDrillDown = opexDrillDown;

    ctx.outputs.push({
      category: FinancialOutputCategory.OPEX,
      code: 'TOTAL_OPERATING_EXPENSES',
      value: ctx.results.totalOpex,
      unitOfMeasure: currency,
      currency,
      stage: this.name,
      formulaReference: 'Sum of Operating Expense Accounts',
      sourceInputReferences: JSON.stringify({ accountsCount: opexDrillDown.length }),
    });

    ctx.outputs.push({
      category: FinancialOutputCategory.OPERATING_PROFIT,
      code: 'OPERATING_PROFIT',
      value: ctx.results.operatingProfit,
      unitOfMeasure: currency,
      currency,
      stage: this.name,
      formulaReference: 'Gross Profit - Total Operating Expenses',
      sourceInputReferences: JSON.stringify({ grossProfit: ctx.results.grossProfit, totalOpex: ctx.results.totalOpex }),
    });

    ctx.outputs.push({
      category: FinancialOutputCategory.OPERATING_PROFIT,
      code: 'OPERATING_MARGIN_PERCENT',
      value: ctx.results.operatingMarginPercentage,
      unitOfMeasure: '%',
      currency,
      stage: this.name,
      formulaReference: '(Operating Profit / Revenue) * 100',
      sourceInputReferences: JSON.stringify({ operatingProfit: ctx.results.operatingProfit, revenue: ctx.results.revenue }),
    });
  }
}
