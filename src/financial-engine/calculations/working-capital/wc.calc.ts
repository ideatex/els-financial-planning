/**
 * Working Capital Calculation Stage
 */

import { CalculationStage, StageExecutionContext } from '../../domain/types/stage.types';
import { CalculationStageName, FinancialOutputCategory, ValidationSeverity } from '../../domain/enums';
import { dec } from '../../domain/decimal';

export class WorkingCapitalCalculationStage implements CalculationStage {
  public readonly name = CalculationStageName.WORKING_CAPITAL;
  public readonly dependencies = [
    CalculationStageName.REVENUE_PROFIT,
    CalculationStageName.PRODUCTION,
    CalculationStageName.STANDARD_COSTING,
  ];

  public execute(ctx: StageExecutionContext): void {
    const { snapshot, context } = ctx;
    const currency = context.currency;

    const periodDays = snapshot.periodDays > 0 ? snapshot.periodDays : 30;

    // 1. Resolve DSO, DIO, DPO
    const dso = snapshot.drivers['RECEIVABLE_DAYS']?.value ??
      snapshot.assumptions['RECEIVABLE_DAYS']?.numericValue ??
      context.config.workingCapitalDSO;

    const dpo = snapshot.drivers['PAYABLE_DAYS']?.value ??
      snapshot.assumptions['PAYABLE_DAYS']?.numericValue ??
      context.config.workingCapitalDPO;

    // Check if defaults were used
    if (!snapshot.drivers['RECEIVABLE_DAYS'] && !snapshot.assumptions['RECEIVABLE_DAYS']) {
      ctx.validations.push({
        code: 'DEFAULT_WORKING_CAPITAL_DSO_USED',
        severity: ValidationSeverity.INFO,
        message: `Using standard configuration DSO of ${dso} days.`,
        calculationStage: this.name,
      });
    }

    const revenue = dec(ctx.results.revenue ?? 0);
    const materialCost = dec(ctx.results.materialCost ?? 0);
    const targetEndingInventory = dec(ctx.results.targetEndingInventory ?? 0);
    const standardUnitCost = dec(ctx.results.standardUnitCost ?? 0);

    // 2. Accounts Receivable = Revenue * (DSO / Period Days)
    const dsoFactor = dec(dso).dividedBy(periodDays);
    const accountsReceivable = revenue.times(dsoFactor);

    // 3. Inventory Valuation = Ending Inventory Units * Standard Unit Cost
    const inventoryValue = targetEndingInventory.times(standardUnitCost);

    // 4. Accounts Payable = Material Purchases/Cost * (DPO / Period Days)
    const dpoFactor = dec(dpo).dividedBy(periodDays);
    const accountsPayable = materialCost.times(dpoFactor);

    // 5. Net Working Capital = (AR + Inventory) - AP
    const netWorkingCapital = accountsReceivable.plus(inventoryValue).minus(accountsPayable);

    ctx.results.accountsReceivable = accountsReceivable.toDecimalPlaces(context.config.rounding.currencyDecimals);
    ctx.results.inventoryValue = inventoryValue.toDecimalPlaces(context.config.rounding.currencyDecimals);
    ctx.results.accountsPayable = accountsPayable.toDecimalPlaces(context.config.rounding.currencyDecimals);
    ctx.results.netWorkingCapital = netWorkingCapital.toDecimalPlaces(context.config.rounding.currencyDecimals);

    ctx.outputs.push({
      category: FinancialOutputCategory.WORKING_CAPITAL,
      code: 'ACCOUNTS_RECEIVABLE',
      value: ctx.results.accountsReceivable,
      unitOfMeasure: currency,
      currency,
      stage: this.name,
      formulaReference: `Revenue * (${dso} DSO / ${periodDays} days)`,
      sourceInputReferences: JSON.stringify({ revenue: ctx.results.revenue, dso, periodDays }),
    });

    ctx.outputs.push({
      category: FinancialOutputCategory.WORKING_CAPITAL,
      code: 'INVENTORY_VALUATION',
      value: ctx.results.inventoryValue,
      unitOfMeasure: currency,
      currency,
      stage: this.name,
      formulaReference: 'Ending Inventory Units * Standard Unit Cost',
      sourceInputReferences: JSON.stringify({
        endingUnits: ctx.results.targetEndingInventory,
        standardUnitCost: ctx.results.standardUnitCost,
      }),
    });

    ctx.outputs.push({
      category: FinancialOutputCategory.WORKING_CAPITAL,
      code: 'ACCOUNTS_PAYABLE',
      value: ctx.results.accountsPayable,
      unitOfMeasure: currency,
      currency,
      stage: this.name,
      formulaReference: `Material Purchases * (${dpo} DPO / ${periodDays} days)`,
      sourceInputReferences: JSON.stringify({ materialCost: ctx.results.materialCost, dpo, periodDays }),
    });

    ctx.outputs.push({
      category: FinancialOutputCategory.WORKING_CAPITAL,
      code: 'NET_WORKING_CAPITAL',
      value: ctx.results.netWorkingCapital,
      unitOfMeasure: currency,
      currency,
      stage: this.name,
      formulaReference: '(Accounts Receivable + Inventory) - Accounts Payable',
      sourceInputReferences: JSON.stringify({
        ar: ctx.results.accountsReceivable,
        inv: ctx.results.inventoryValue,
        ap: ctx.results.accountsPayable,
      }),
    });
  }
}
