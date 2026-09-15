/**
 * Basic Balance Sheet & Integrity Reconciliation Stage
 */

import { CalculationStage, StageExecutionContext } from '../../domain/types/stage.types';
import { CalculationStageName, FinancialOutputCategory, ValidationSeverity } from '../../domain/enums';
import { dec } from '../../domain/decimal';

export class BalanceSheetCalculationStage implements CalculationStage {
  public readonly name = CalculationStageName.BALANCE_SHEET;
  public readonly dependencies = [
    CalculationStageName.WORKING_CAPITAL,
    CalculationStageName.CASH_FLOW,
    CalculationStageName.OPEX_AGGREGATION,
  ];

  public execute(ctx: StageExecutionContext): void {
    const { snapshot, context } = ctx;
    const currency = context.currency;

    // 1. Assets
    const cash = dec(ctx.results.closingCash ?? 0);
    const ar = dec(ctx.results.accountsReceivable ?? 0);
    const inventory = dec(ctx.results.inventoryValue ?? 0);

    const fixedAssetsInput = snapshot.inputs['FIXED_ASSETS'];
    const fixedAssets = fixedAssetsInput && !isNaN(fixedAssetsInput.inputValue)
      ? dec(fixedAssetsInput.inputValue)
      : dec(0);

    const totalAssets = cash.plus(ar).plus(inventory).plus(fixedAssets);

    // 2. Liabilities
    const ap = dec(ctx.results.accountsPayable ?? 0);
    const debtInput = snapshot.inputs['DEBT_BALANCE'];
    const debt = debtInput && !isNaN(debtInput.inputValue)
      ? dec(debtInput.inputValue)
      : dec(0);

    const totalLiabilities = ap.plus(debt);

    // 3. Equity
    const openingEquityInput = snapshot.inputs['OPENING_EQUITY'];
    const openingEquity = openingEquityInput && !isNaN(openingEquityInput.inputValue)
      ? dec(openingEquityInput.inputValue)
      : dec(0);

    const currentPeriodProfit = dec(ctx.results.operatingProfit ?? 0);
    const totalEquity = openingEquity.plus(currentPeriodProfit);

    // 4. Accounting Integrity Check: Assets = Liabilities + Equity
    const totalLiabilitiesAndEquity = totalLiabilities.plus(totalEquity);
    const imbalance = totalAssets.minus(totalLiabilitiesAndEquity);

    ctx.results.totalAssets = totalAssets.toDecimalPlaces(context.config.rounding.currencyDecimals);
    ctx.results.totalLiabilities = totalLiabilities.toDecimalPlaces(context.config.rounding.currencyDecimals);
    ctx.results.totalEquity = totalEquity.toDecimalPlaces(context.config.rounding.currencyDecimals);
    ctx.results.balanceSheetImbalance = imbalance.toDecimalPlaces(context.config.rounding.currencyDecimals);

    if (imbalance.abs().greaterThan(0.01)) {
      ctx.validations.push({
        code: 'BALANCE_SHEET_IMBALANCE',
        severity: ValidationSeverity.INFO,
        message: `Balance sheet discrepancy detected: Assets (${ctx.results.totalAssets}) != Liabilities (${ctx.results.totalLiabilities}) + Equity (${ctx.results.totalEquity}). Net difference: ${ctx.results.balanceSheetImbalance}.`,
        calculationStage: this.name,
        suggestedResolution: 'Provide complete opening balance sheet figures (Fixed Assets, Opening Debt, Opening Equity) to reconcile standalone single-month statutory statements.',
      });
    }

    ctx.outputs.push({
      category: FinancialOutputCategory.BALANCE_SHEET,
      code: 'TOTAL_ASSETS',
      value: ctx.results.totalAssets,
      unitOfMeasure: currency,
      currency,
      stage: this.name,
      formulaReference: 'Cash + Accounts Receivable + Inventory + Fixed Assets',
      sourceInputReferences: JSON.stringify({
        cash: ctx.results.closingCash,
        ar: ctx.results.accountsReceivable,
        inventory: ctx.results.inventoryValue,
      }),
    });

    ctx.outputs.push({
      category: FinancialOutputCategory.BALANCE_SHEET,
      code: 'TOTAL_LIABILITIES',
      value: ctx.results.totalLiabilities,
      unitOfMeasure: currency,
      currency,
      stage: this.name,
      formulaReference: 'Accounts Payable + Total Debt',
      sourceInputReferences: JSON.stringify({ ap: ctx.results.accountsPayable, debt: debt.toNumber() }),
    });

    ctx.outputs.push({
      category: FinancialOutputCategory.BALANCE_SHEET,
      code: 'TOTAL_EQUITY',
      value: ctx.results.totalEquity,
      unitOfMeasure: currency,
      currency,
      stage: this.name,
      formulaReference: 'Opening Equity + Current Period Operating Profit',
      sourceInputReferences: JSON.stringify({
        openingEquity: openingEquity.toNumber(),
        operatingProfit: ctx.results.operatingProfit,
      }),
    });

    ctx.outputs.push({
      category: FinancialOutputCategory.BALANCE_SHEET,
      code: 'BALANCE_SHEET_IMBALANCE',
      value: ctx.results.balanceSheetImbalance,
      unitOfMeasure: currency,
      currency,
      stage: this.name,
      formulaReference: 'Total Assets - (Total Liabilities + Total Equity)',
    });
  }
}
