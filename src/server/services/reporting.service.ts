/**
 * Financial & Operational Reporting Service
 * Generates verified reporting statements (P&L, Revenue, Production, Materials, Labor, Opex, Summary) and CSV exports.
 */

import { calculatePlanVsActualVariance, VarianceComparisonParams } from './variance.service';
import { db } from '@/lib/db';
import { NotFoundError } from '@/core/errors/AppError';

export interface ReportFilterOptions extends VarianceComparisonParams {
  quarter?: number;
  yearToDate?: boolean;
}

/**
 * 1. Plan vs Actual P&L Report
 */
export async function generatePnlReport(orgId: string, filters: ReportFilterOptions) {
  const varianceData = await calculatePlanVsActualVariance(orgId, filters);

  const pnlLines = [
    varianceData.items.find((i) => i.metricCode === 'REVENUE'),
    varianceData.items.find((i) => i.metricCode === 'COGS'),
    varianceData.items.find((i) => i.metricCode === 'GROSS_PROFIT'),
    varianceData.items.find((i) => i.metricCode === 'OPEX'),
    varianceData.items.find((i) => i.metricCode === 'OPERATING_PROFIT'),
  ].filter(Boolean);

  return {
    reportTitle: 'Plan vs Actual Manufacturing Income Statement (P&L)',
    organizationId: orgId,
    planVersion: varianceData.planVersion,
    fiscalPeriod: varianceData.fiscalPeriod,
    plant: varianceData.plant,
    product: varianceData.product,
    currency: varianceData.currency,
    generatedAt: new Date(),
    summary: varianceData.summary,
    lines: pnlLines,
  };
}

/**
 * 2. Revenue Operational Report (Volume vs Price breakdown)
 */
export async function generateRevenueReport(orgId: string, filters: ReportFilterOptions) {
  const varianceData = await calculatePlanVsActualVariance(orgId, filters);
  const revItem = varianceData.items.find((i) => i.metricCode === 'REVENUE');

  return {
    reportTitle: 'Revenue Analysis & Price-Volume Variance Report',
    organizationId: orgId,
    planVersion: varianceData.planVersion,
    fiscalPeriod: varianceData.fiscalPeriod,
    currency: varianceData.currency,
    generatedAt: new Date(),
    revenueMetric: revItem,
    decomposition: revItem?.decomposition,
  };
}

/**
 * 3. Production Operational Report (Units, Scrap, Efficiency)
 */
export async function generateProductionReport(orgId: string, filters: ReportFilterOptions) {
  const varianceData = await calculatePlanVsActualVariance(orgId, filters);
  const prodItem = varianceData.items.find((i) => i.metricCode === 'PRODUCTION_VOLUME');

  return {
    reportTitle: 'Manufacturing Production & Volume Report',
    organizationId: orgId,
    planVersion: varianceData.planVersion,
    fiscalPeriod: varianceData.fiscalPeriod,
    plant: varianceData.plant,
    product: varianceData.product,
    generatedAt: new Date(),
    productionMetric: prodItem,
  };
}

/**
 * 4. Material Cost Report (Direct Materials, Unit Rates)
 */
export async function generateMaterialReport(orgId: string, filters: ReportFilterOptions) {
  const varianceData = await calculatePlanVsActualVariance(orgId, filters);
  const matItem = varianceData.items.find((i) => i.metricCode === 'MATERIAL_COST');

  return {
    reportTitle: 'Direct Material Cost & Variance Report',
    organizationId: orgId,
    planVersion: varianceData.planVersion,
    fiscalPeriod: varianceData.fiscalPeriod,
    currency: varianceData.currency,
    generatedAt: new Date(),
    materialMetric: matItem,
  };
}

/**
 * 5. Labor Cost Report (Direct Labor, Hours, Rates)
 */
export async function generateLaborReport(orgId: string, filters: ReportFilterOptions) {
  const varianceData = await calculatePlanVsActualVariance(orgId, filters);
  const laborItem = varianceData.items.find((i) => i.metricCode === 'LABOR_COST');

  return {
    reportTitle: 'Direct Labor Cost & Efficiency Report',
    organizationId: orgId,
    planVersion: varianceData.planVersion,
    fiscalPeriod: varianceData.fiscalPeriod,
    currency: varianceData.currency,
    generatedAt: new Date(),
    laborMetric: laborItem,
  };
}

/**
 * 6. Operating Expenses (Opex) Report
 */
export async function generateOpexReport(orgId: string, filters: ReportFilterOptions) {
  const varianceData = await calculatePlanVsActualVariance(orgId, filters);
  const opexItem = varianceData.items.find((i) => i.metricCode === 'OPEX');

  return {
    reportTitle: 'Operating Expenses (Opex) Variance Report',
    organizationId: orgId,
    planVersion: varianceData.planVersion,
    fiscalPeriod: varianceData.fiscalPeriod,
    currency: varianceData.currency,
    generatedAt: new Date(),
    opexMetric: opexItem,
  };
}

/**
 * 7. Variance Summary & Top Drivers Report
 */
export async function generateVarianceSummaryReport(orgId: string, filters: ReportFilterOptions) {
  const varianceData = await calculatePlanVsActualVariance(orgId, filters);

  const favorableVariances = [...varianceData.items]
    .filter((i) => i.favorability === 'FAVORABLE')
    .sort((a, b) => Math.abs(b.varianceAmount) - Math.abs(a.varianceAmount));

  const unfavorableVariances = [...varianceData.items]
    .filter((i) => i.favorability === 'UNFAVORABLE')
    .sort((a, b) => Math.abs(b.varianceAmount) - Math.abs(a.varianceAmount));

  const openComments = await db.varianceComment.findMany({
    where: {
      organizationId: orgId,
      planVersionId: filters.planVersionId,
      fiscalPeriodId: filters.fiscalPeriodId,
      status: { in: ['OPEN', 'UNDER_REVIEW', 'ACTION_REQUIRED'] },
    },
    include: {
      createdByUser: { select: { name: true, email: true } },
    },
  });

  return {
    reportTitle: 'Executive Variance Summary & Risk Alert',
    organizationId: orgId,
    planVersion: varianceData.planVersion,
    fiscalPeriod: varianceData.fiscalPeriod,
    currency: varianceData.currency,
    generatedAt: new Date(),
    summary: varianceData.summary,
    topFavorable: favorableVariances.slice(0, 3),
    topUnfavorable: unfavorableVariances.slice(0, 3),
    openCommentaryItems: openComments,
  };
}

/**
 * Exports report items into RFC 4180 CSV string.
 */
export function exportReportCsv(
  title: string,
  meta: { organization: string; planVersion: string; period: string; currency: string },
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>
): string {
  const lines: string[] = [];

  // Report Header Metadata
  lines.push(`"${title}"`);
  lines.push(`"Organization","${meta.organization}"`);
  lines.push(`"Plan Version","${meta.planVersion}"`);
  lines.push(`"Fiscal Period","${meta.period}"`);
  lines.push(`"Currency","${meta.currency}"`);
  lines.push(`"Export Timestamp","${new Date().toISOString()}"`);
  lines.push(''); // Blank line

  // Column Headers
  lines.push(headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(','));

  // Data Rows
  rows.forEach((row) => {
    const formatted = row.map((cell) => {
      if (cell === null || cell === undefined) return '""';
      if (typeof cell === 'number') return cell.toString();
      return `"${cell.toString().replace(/"/g, '""')}"`;
    });
    lines.push(formatted.join(','));
  });

  return lines.join('\n');
}
