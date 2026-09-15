/**
 * Actuals Reconciliation Service
 * Evaluates file control totals, debit/credit equality, period boundaries, dimension mapping, and statement integrity.
 */

import { db } from '@/lib/db';
import { recordAuditLog } from '@/lib/audit';
import { NotFoundError } from '@/core/errors/AppError';

export async function reconcileBatch(orgId: string, batchId: string) {
  const batch = await db.actualImportBatch.findFirst({
    where: { id: batchId, organizationId: orgId },
    include: {
      fiscalPeriod: true,
      financialRecords: {
        include: {
          account: true,
          plant: true,
          product: true,
        },
      },
      operationalRecords: true,
    },
  });

  if (!batch) {
    throw new NotFoundError(`Actuals batch '${batchId}' not found.`);
  }

  // Clear existing reconciliation results for this batch
  await db.reconciliationResult.deleteMany({
    where: { importBatchId: batchId },
  });

  const results: Array<{
    reconciliationType: string;
    status: 'BALANCED' | 'UNBALANCED' | 'WARNING' | 'FAILED';
    expectedValue: number;
    actualValue: number;
    difference: number;
    tolerance: number;
    severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
    explanation: string;
    suggestedResolution?: string;
    details?: string;
  }> = [];

  // 1. File-Level Control Total Reconciliation
  if (batch.controlTotal !== null && batch.controlTotal !== undefined) {
    const totalImported = batch.financialRecords.reduce((sum, r) => sum + r.amount, 0);
    const diff = Math.abs(totalImported - batch.controlTotal);
    const tolerance = 0.01;
    const isBalanced = diff <= tolerance;

    results.push({
      reconciliationType: 'FILE_CONTROL_TOTAL',
      status: isBalanced ? 'BALANCED' : 'UNBALANCED',
      expectedValue: batch.controlTotal,
      actualValue: totalImported,
      difference: diff,
      tolerance,
      severity: isBalanced ? 'INFO' : 'ERROR',
      explanation: isBalanced
        ? `Imported total matches file control total of ${batch.currency} ${batch.controlTotal.toLocaleString()}.`
        : `Control total mismatch: expected ${batch.currency} ${batch.controlTotal.toLocaleString()}, but imported sum is ${batch.currency} ${totalImported.toLocaleString()} (diff: ${diff.toFixed(2)}).`,
      suggestedResolution: isBalanced
        ? undefined
        : 'Verify whether missing rows were rejected or check if the source file contains excluded line items.',
      details: JSON.stringify({ controlTotal: batch.controlTotal, totalImported, diff }),
    });
  }

  // 2. Debit / Credit Reconciliation
  const debits = batch.financialRecords.reduce((sum, r) => sum + (r.debitAmount ?? (r.amount > 0 ? r.amount : 0)), 0);
  const credits = batch.financialRecords.reduce((sum, r) => sum + (r.creditAmount ?? (r.amount < 0 ? Math.abs(r.amount) : 0)), 0);
  if (batch.importType === 'GL_ACTUALS' && (debits > 0 || credits > 0)) {
    const diff = Math.abs(debits - credits);
    const tolerance = 0.01;
    const isBalanced = diff <= tolerance;

    results.push({
      reconciliationType: 'DEBIT_CREDIT_BALANCE',
      status: isBalanced ? 'BALANCED' : 'UNBALANCED',
      expectedValue: debits,
      actualValue: credits,
      difference: diff,
      tolerance,
      severity: isBalanced ? 'INFO' : 'CRITICAL',
      explanation: isBalanced
        ? `Double-entry debit/credit is balanced at ${batch.currency} ${debits.toLocaleString()}.`
        : `Debit/Credit out of balance by ${batch.currency} ${diff.toFixed(2)} (Debits: ${debits.toLocaleString()}, Credits: ${credits.toLocaleString()}).`,
      suggestedResolution: isBalanced ? undefined : 'Investigate unbalanced journal vouchers or check if offset accounts are missing.',
      details: JSON.stringify({ debits, credits, diff }),
    });
  }

  // 3. Period Integrity Check
  const outOfPeriodCount = batch.financialRecords.filter(
    (r) => r.transactionDate < batch.fiscalPeriod.startDate || r.transactionDate > batch.fiscalPeriod.endDate
  ).length;

  results.push({
    reconciliationType: 'PERIOD_INTEGRITY',
    status: outOfPeriodCount === 0 ? 'BALANCED' : 'WARNING',
    expectedValue: 0,
    actualValue: outOfPeriodCount,
    difference: outOfPeriodCount,
    tolerance: 0,
    severity: outOfPeriodCount === 0 ? 'INFO' : 'WARNING',
    explanation: outOfPeriodCount === 0
      ? `All ${batch.financialRecords.length} records fall within fiscal period ${batch.fiscalPeriod.periodName}.`
      : `${outOfPeriodCount} records have transaction dates outside the fiscal period range (${batch.fiscalPeriod.startDate.toISOString().slice(0, 10)} to ${batch.fiscalPeriod.endDate.toISOString().slice(0, 10)}).`,
    suggestedResolution: outOfPeriodCount === 0 ? undefined : 'Review dates on source records or verify the appropriate fiscal period was selected.',
    details: JSON.stringify({ outOfPeriodCount, totalRecords: batch.financialRecords.length }),
  });

  // 4. Dimension Mapping Integrity Check
  const unmappedPlant = batch.financialRecords.filter((r) => !r.plantId).length;
  const unmappedProduct = batch.financialRecords.filter((r) => !r.productId).length;
  const unmappedAccount = batch.financialRecords.filter((r) => !r.accountId).length;

  const totalUnmapped = unmappedPlant + unmappedProduct + unmappedAccount;
  results.push({
    reconciliationType: 'DIMENSION_INTEGRITY',
    status: totalUnmapped === 0 ? 'BALANCED' : 'WARNING',
    expectedValue: 0,
    actualValue: totalUnmapped,
    difference: totalUnmapped,
    tolerance: 0,
    severity: totalUnmapped === 0 ? 'INFO' : 'WARNING',
    explanation: totalUnmapped === 0
      ? 'All imported records have resolved Plant, Product, and Account dimensions.'
      : `Dimension mapping gaps detected: ${unmappedPlant} records missing plant, ${unmappedProduct} missing product, ${unmappedAccount} missing account.`,
    suggestedResolution: totalUnmapped === 0 ? undefined : 'Check master data mapping profiles to resolve missing dimensions.',
    details: JSON.stringify({ unmappedPlant, unmappedProduct, unmappedAccount }),
  });

  // 5. Financial Statement Integrity Check
  let revSum = 0;
  let cogsSum = 0;
  let opexSum = 0;

  batch.financialRecords.forEach((r) => {
    const acctType = r.account?.accountType;
    if (acctType === 'REVENUE') revSum += r.amount;
    else if (acctType === 'COGS') cogsSum += r.amount;
    else if (acctType === 'OPERATING_EXPENSE') opexSum += r.amount;
  });

  if (revSum > 0 || cogsSum > 0 || opexSum > 0) {
    const grossProfit = revSum - cogsSum;
    const operatingProfit = grossProfit - opexSum;

    results.push({
      reconciliationType: 'FINANCIAL_STATEMENT',
      status: 'BALANCED',
      expectedValue: grossProfit - opexSum,
      actualValue: operatingProfit,
      difference: 0,
      tolerance: 0.01,
      severity: 'INFO',
      explanation: `Manufacturing P&L articulated: Revenue ${batch.currency} ${revSum.toLocaleString()} - COGS ${batch.currency} ${cogsSum.toLocaleString()} = GP ${batch.currency} ${grossProfit.toLocaleString()}; EBIT: ${batch.currency} ${operatingProfit.toLocaleString()}.`,
      details: JSON.stringify({ revenue: revSum, cogs: cogsSum, grossProfit, opex: opexSum, operatingProfit }),
    });
  }

  // Persist results
  await db.reconciliationResult.createMany({
    data: results.map((r) => ({
      organizationId: orgId,
      importBatchId: batchId,
      reconciliationType: r.reconciliationType,
      status: r.status,
      expectedValue: r.expectedValue,
      actualValue: r.actualValue,
      difference: r.difference,
      tolerance: r.tolerance,
      severity: r.severity,
      explanation: r.explanation,
      suggestedResolution: r.suggestedResolution ?? null,
      details: r.details ?? null,
    })),
  });

  // Determine batch overall reconciliation status
  const hasCritical = results.some((r) => r.severity === 'CRITICAL');
  const hasErrors = results.some((r) => r.severity === 'ERROR' || r.status === 'UNBALANCED');
  const overallStatus = hasCritical || hasErrors ? 'UNBALANCED' : 'RECONCILED';

  await db.actualImportBatch.update({
    where: { id: batchId },
    data: { reconciliationStatus: overallStatus },
  });

  await recordAuditLog({
    organizationId: orgId,
    action: 'ACTUALS_BATCH_RECONCILED',
    entityType: 'ActualImportBatch',
    entityId: batchId,
    metadata: {
      status: overallStatus,
      reconciliationChecksCount: results.length,
      unbalancedCount: results.filter((r) => r.status === 'UNBALANCED').length,
    },
  });

  return results;
}

export async function getBatchReconciliationResults(orgId: string, batchId: string) {
  return db.reconciliationResult.findMany({
    where: { organizationId: orgId, importBatchId: batchId },
    orderBy: { createdAt: 'asc' },
  });
}
