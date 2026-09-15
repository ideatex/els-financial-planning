/**
 * Basic Cash Flow Calculation Stage
 */

import { CalculationStage, StageExecutionContext } from '../../domain/types/stage.types';
import { CalculationStageName, FinancialOutputCategory, ValidationSeverity } from '../../domain/enums';
import { dec } from '../../domain/decimal';

export class CashFlowCalculationStage implements CalculationStage {
  public readonly name = CalculationStageName.CASH_FLOW;
  public readonly dependencies = [
    CalculationStageName.OPEX_AGGREGATION,
    CalculationStageName.WORKING_CAPITAL,
  ];

  public execute(ctx: StageExecutionContext): void {
    const { snapshot, context } = ctx;
    const currency = context.currency;

    // 1. Resolve Opening Cash
    let openingCash = dec(0);
    const openingCashInput = snapshot.inputs['OPENING_CASH'];
    if (openingCashInput && !isNaN(openingCashInput.inputValue)) {
      openingCash = dec(openingCashInput.inputValue);
    } else if (snapshot.assumptions['OPENING_CASH']?.numericValue) {
      openingCash = dec(snapshot.assumptions['OPENING_CASH'].numericValue!);
    } else {
      ctx.validations.push({
        code: 'MISSING_OPENING_CASH_INPUT',
        severity: ValidationSeverity.INFO,
        message: 'Opening cash balance is not configured; assuming ₹0 opening cash for standalone period analysis.',
        calculationStage: this.name,
        suggestedResolution: 'Provide an OPENING_CASH input or assumption for complete treasury cash modeling.',
      });
    }

    // 2. Cash Receipts from Customers
    // Collections = Revenue - Accounts Receivable
    const revenue = dec(ctx.results.revenue ?? 0);
    const ar = dec(ctx.results.accountsReceivable ?? 0);
    const cashReceipts = revenue.greaterThan(ar) ? revenue.minus(ar) : revenue;

    // 3. Cash Disbursements
    // Material Payments = Material Cost - Accounts Payable
    const materialCost = dec(ctx.results.materialCost ?? 0);
    const ap = dec(ctx.results.accountsPayable ?? 0);
    const materialPayments = materialCost.greaterThan(ap) ? materialCost.minus(ap) : materialCost;

    const laborCost = dec(ctx.results.laborCost ?? 0);
    const overheadCost = dec(ctx.results.overheadCost ?? 0);
    const totalOpex = dec(ctx.results.totalOpex ?? 0);

    const operatingDisbursements = materialPayments.plus(laborCost).plus(overheadCost).plus(totalOpex);

    // Operating Cash Flow = Receipts - Disbursements
    const operatingCashFlow = cashReceipts.minus(operatingDisbursements);

    // 4. Investing & Financing Cash Flow (if inputs exist)
    const capexInput = snapshot.inputs['CAPEX'] ?? snapshot.inputs['CAPITAL_EXPENDITURE'];
    const capex = capexInput && !isNaN(capexInput.inputValue) ? dec(capexInput.inputValue) : dec(0);
    const investingCashFlow = capex.negate(); // Cash outflow

    const debtInput = snapshot.inputs['NEW_FINANCING'] ?? snapshot.inputs['DEBT_ISSUANCE'];
    const financingCashFlow = debtInput && !isNaN(debtInput.inputValue) ? dec(debtInput.inputValue) : dec(0);

    // Net Change in Cash
    const netChangeInCash = operatingCashFlow.plus(investingCashFlow).plus(financingCashFlow);

    // Closing Cash = Opening Cash + Net Change
    const closingCash = openingCash.plus(netChangeInCash);

    ctx.results.operatingCashFlow = operatingCashFlow.toDecimalPlaces(context.config.rounding.currencyDecimals);
    ctx.results.netChangeInCash = netChangeInCash.toDecimalPlaces(context.config.rounding.currencyDecimals);
    ctx.results.closingCash = closingCash.toDecimalPlaces(context.config.rounding.currencyDecimals);

    ctx.outputs.push({
      category: FinancialOutputCategory.CASH_FLOW,
      code: 'OPENING_CASH',
      value: openingCash.toDecimalPlaces(context.config.rounding.currencyDecimals),
      unitOfMeasure: currency,
      currency,
      stage: this.name,
      formulaReference: 'OPENING_CASH',
    });

    ctx.outputs.push({
      category: FinancialOutputCategory.CASH_FLOW,
      code: 'OPERATING_CASH_FLOW',
      value: ctx.results.operatingCashFlow,
      unitOfMeasure: currency,
      currency,
      stage: this.name,
      formulaReference: 'Cash Receipts - (Material Payments + Labor + Overhead + Opex)',
      sourceInputReferences: JSON.stringify({
        receipts: cashReceipts.toNumber(),
        disbursements: operatingDisbursements.toNumber(),
      }),
    });

    ctx.outputs.push({
      category: FinancialOutputCategory.CASH_FLOW,
      code: 'NET_CHANGE_IN_CASH',
      value: ctx.results.netChangeInCash,
      unitOfMeasure: currency,
      currency,
      stage: this.name,
      formulaReference: 'Operating Cash Flow + Investing Cash Flow + Financing Cash Flow',
      sourceInputReferences: JSON.stringify({
        operating: ctx.results.operatingCashFlow,
        investing: investingCashFlow.toNumber(),
        financing: financingCashFlow.toNumber(),
      }),
    });

    ctx.outputs.push({
      category: FinancialOutputCategory.CASH_FLOW,
      code: 'CLOSING_CASH',
      value: ctx.results.closingCash,
      unitOfMeasure: currency,
      currency,
      stage: this.name,
      formulaReference: 'Opening Cash + Net Change in Cash',
    });
  }
}
