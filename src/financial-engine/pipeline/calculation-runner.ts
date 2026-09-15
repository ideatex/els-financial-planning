/**
 * Calculation Runner & Pipeline Orchestrator
 */

import { CalculationContext } from '../domain/types/context.types';
import { InputSnapshot } from '../domain/types/snapshot.types';
import { CalculationStage, StageExecutionContext } from '../domain/types/stage.types';
import { FinancialResultSummary, OutputRecord } from '../domain/types/output.types';
import { ValidationErrorDetail } from '../domain/errors';
import { CalculationRunStatus, ValidationSeverity } from '../domain/enums';
import { sortStagesTopologically } from './dependency-graph';

// Calculation stages
import { DemandCalculationStage } from '../calculations/demand/demand.calc';
import { ProductionCalculationStage } from '../calculations/production/production.calc';
import { MaterialCostCalculationStage } from '../calculations/materials/material.calc';
import { LaborCostCalculationStage } from '../calculations/labor/labor.calc';
import { OverheadCalculationStage } from '../calculations/overhead/overhead.calc';
import { StandardCostCalculationStage } from '../calculations/costing/costing.calc';
import { CogmCogsCalculationStage } from '../calculations/cogm-cogs/cogm-cogs.calc';
import { RevenueProfitCalculationStage } from '../calculations/revenue/revenue.calc';
import { OpexCalculationStage } from '../calculations/opex/opex.calc';
import { WorkingCapitalCalculationStage } from '../calculations/working-capital/wc.calc';
import { CashFlowCalculationStage } from '../calculations/cash-flow/cash-flow.calc';
import { BalanceSheetCalculationStage } from '../calculations/balance-sheet/bs.calc';

export interface CalculationPipelineResult {
  runId: string;
  status: CalculationRunStatus;
  durationMs: number;
  engineVersion: string;
  summary: FinancialResultSummary;
  outputs: OutputRecord[];
  validations: ValidationErrorDetail[];
  errorCount: number;
  warningCount: number;
  failureReason?: string;
}

export class CalculationRunner {
  private readonly stages: CalculationStage[];

  constructor(customStages?: CalculationStage[]) {
    const defaultStages: CalculationStage[] = [
      new DemandCalculationStage(),
      new ProductionCalculationStage(),
      new MaterialCostCalculationStage(),
      new LaborCostCalculationStage(),
      new OverheadCalculationStage(),
      new StandardCostCalculationStage(),
      new CogmCogsCalculationStage(),
      new RevenueProfitCalculationStage(),
      new OpexCalculationStage(),
      new WorkingCapitalCalculationStage(),
      new CashFlowCalculationStage(),
      new BalanceSheetCalculationStage(),
    ];

    this.stages = sortStagesTopologically(customStages || defaultStages);
  }

  public async execute(
    context: CalculationContext,
    snapshot: InputSnapshot
  ): Promise<CalculationPipelineResult> {
    const startTime = Date.now();

    const stageContext: StageExecutionContext = {
      context,
      snapshot,
      results: {},
      outputs: [],
      validations: [],
    };

    let failureReason: string | undefined;

    try {
      for (const stage of this.stages) {
        await stage.execute(stageContext);

        // Check if a blocking critical/error occurred
        const hasBlockingError = stageContext.validations.some(
          (v) => v.severity === ValidationSeverity.CRITICAL || v.severity === ValidationSeverity.ERROR
        );

        if (hasBlockingError) {
          const firstError = stageContext.validations.find(
            (v) => v.severity === ValidationSeverity.CRITICAL || v.severity === ValidationSeverity.ERROR
          );
          failureReason = firstError?.message || `Validation error encountered in stage ${stage.name}`;
          break;
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      failureReason = `Calculation execution failed: ${msg}`;
      stageContext.validations.push({
        code: 'EXECUTION_EXCEPTION',
        severity: ValidationSeverity.CRITICAL,
        message: failureReason,
        calculationStage: 'RUNNER',
      });
    }

    const durationMs = Date.now() - startTime;

    const errorCount = stageContext.validations.filter(
      (v) => v.severity === ValidationSeverity.ERROR || v.severity === ValidationSeverity.CRITICAL
    ).length;

    const warningCount = stageContext.validations.filter(
      (v) => v.severity === ValidationSeverity.WARNING
    ).length;

    let status: CalculationRunStatus;
    if (errorCount > 0) {
      status = CalculationRunStatus.FAILED;
    } else if (warningCount > 0) {
      status = CalculationRunStatus.COMPLETED_WITH_WARNINGS;
    } else {
      status = CalculationRunStatus.COMPLETED;
    }

    const summary: FinancialResultSummary = {
      salesQuantity: stageContext.results.salesQuantity ?? 0,
      sellingPrice: stageContext.results.sellingPrice ?? 0,
      revenue: stageContext.results.revenue ?? 0,
      beginningInventory: stageContext.results.beginningInventory ?? 0,
      targetEndingInventory: stageContext.results.targetEndingInventory ?? 0,
      netProductionQuantity: stageContext.results.netProductionQuantity ?? 0,
      grossProductionQuantity: stageContext.results.grossProductionQuantity ?? 0,
      scrapQuantity: stageContext.results.scrapQuantity ?? 0,
      materialCost: stageContext.results.materialCost ?? 0,
      laborCost: stageContext.results.laborCost ?? 0,
      overheadCost: stageContext.results.overheadCost ?? 0,
      totalProductionCost: stageContext.results.totalProductionCost ?? 0,
      standardUnitCost: stageContext.results.standardUnitCost ?? 0,
      cogs: stageContext.results.cogs ?? 0,
      grossProfit: stageContext.results.grossProfit ?? 0,
      grossMarginPercentage: stageContext.results.grossMarginPercentage ?? 0,
      totalOpex: stageContext.results.totalOpex ?? 0,
      operatingProfit: stageContext.results.operatingProfit ?? 0,
      operatingMarginPercentage: stageContext.results.operatingMarginPercentage ?? 0,
      accountsReceivable: stageContext.results.accountsReceivable ?? 0,
      inventoryValue: stageContext.results.inventoryValue ?? 0,
      accountsPayable: stageContext.results.accountsPayable ?? 0,
      netWorkingCapital: stageContext.results.netWorkingCapital ?? 0,
      operatingCashFlow: stageContext.results.operatingCashFlow ?? 0,
      netChangeInCash: stageContext.results.netChangeInCash ?? 0,
      closingCash: stageContext.results.closingCash ?? 0,
      totalAssets: stageContext.results.totalAssets ?? 0,
      totalLiabilities: stageContext.results.totalLiabilities ?? 0,
      totalEquity: stageContext.results.totalEquity ?? 0,
      balanceSheetImbalance: stageContext.results.balanceSheetImbalance ?? 0,
      materialCostDrillDown: stageContext.results.materialCostDrillDown ?? [],
      laborCostDrillDown: stageContext.results.laborCostDrillDown ?? [],
      overheadDrillDown: stageContext.results.overheadDrillDown ?? {
        method: 'UNIT_RATE',
        overheadRatePerUnit: 0,
        fixedOverheadAmount: 0,
        extendedTotalCost: 0,
      },
      opexDrillDown: stageContext.results.opexDrillDown ?? [],
    };

    return {
      runId: context.calculationRunId,
      status,
      durationMs,
      engineVersion: context.config.engineVersion,
      summary,
      outputs: stageContext.outputs,
      validations: stageContext.validations,
      errorCount,
      warningCount,
      failureReason,
    };
  }
}
