/**
 * Input Readiness Validator
 * Checks whether all required data is configured before executing calculations
 */

import { InputSnapshot } from '../domain/types/snapshot.types';

export interface ReadinessCheckItem {
  id: string;
  category: 'DEMAND' | 'PRODUCTION' | 'BOM' | 'ROUTING' | 'OVERHEAD' | 'OPEX' | 'GOVERNANCE';
  title: string;
  description: string;
  isReady: boolean;
  severity: 'BLOCKING' | 'WARNING' | 'OPTIONAL';
  valueDisplay?: string;
  actionHref?: string;
}

export interface ReadinessReport {
  isReady: boolean;
  scorePercentage: number;
  totalChecks: number;
  passedChecks: number;
  checks: ReadinessCheckItem[];
  blockers: string[];
  warnings: string[];
}

export function evaluateInputReadiness(snapshot: InputSnapshot, planVersionStatus: string): ReadinessReport {
  const checks: ReadinessCheckItem[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];

  // 1. Governance check: Plan Version Status
  const isUnlocked = planVersionStatus !== 'LOCKED';
  checks.push({
    id: 'gov_status',
    category: 'GOVERNANCE',
    title: 'Plan Version State',
    description: isUnlocked ? `Version is editable (${planVersionStatus})` : 'Plan version is LOCKED and immutable',
    isReady: isUnlocked,
    severity: 'BLOCKING',
    valueDisplay: planVersionStatus,
  });
  if (!isUnlocked) blockers.push('Plan Version is LOCKED; new calculations cannot be executed.');

  // 2. Demand: Sales Volume
  const salesInput = snapshot.inputs['SALES_VOLUME'];
  const hasSales = Boolean(salesInput && !isNaN(salesInput.inputValue) && salesInput.inputValue >= 0);
  checks.push({
    id: 'demand_sales_volume',
    category: 'DEMAND',
    title: 'Planned Sales Quantity',
    description: hasSales ? `Planned sales: ${salesInput!.inputValue} ${salesInput!.unitOfMeasure}` : 'Missing planned sales quantity',
    isReady: hasSales,
    severity: 'BLOCKING',
    valueDisplay: hasSales ? `${salesInput!.inputValue} EA` : 'Missing',
    actionHref: '/planning-inputs',
  });
  if (!hasSales) blockers.push('Missing SALES_VOLUME input.');

  // 3. Demand: Selling Price
  const priceInput = snapshot.inputs['SELLING_PRICE'];
  const hasPrice = Boolean(
    (priceInput && !isNaN(priceInput.inputValue) && priceInput.inputValue > 0) ||
    (snapshot.assumptions['SELLING_PRICE']?.numericValue && snapshot.assumptions['SELLING_PRICE'].numericValue > 0) ||
    snapshot.product.standardPriceCents > 0
  );
  const priceVal = priceInput?.inputValue ?? snapshot.assumptions['SELLING_PRICE']?.numericValue ?? (snapshot.product.standardPriceCents / 100);
  checks.push({
    id: 'demand_selling_price',
    category: 'DEMAND',
    title: 'Selling Price',
    description: hasPrice ? `Selling price: ${snapshot.currency} ${priceVal}` : 'Missing contract or standard selling price',
    isReady: hasPrice,
    severity: 'BLOCKING',
    valueDisplay: hasPrice ? `${snapshot.currency} ${priceVal}` : 'Missing',
    actionHref: '/planning-inputs',
  });
  if (!hasPrice) blockers.push('Missing selling price.');

  // 4. Production: Target Ending Inventory
  const endInvInput = snapshot.inputs['TARGET_ENDING_INVENTORY'];
  const hasEndInv = Boolean(endInvInput && !isNaN(endInvInput.inputValue));
  checks.push({
    id: 'prod_ending_inv',
    category: 'PRODUCTION',
    title: 'Target Ending Inventory',
    description: hasEndInv ? `Target ending inventory: ${endInvInput!.inputValue} EA` : 'Defaulting to 0 EA target ending inventory',
    isReady: true,
    severity: 'OPTIONAL',
    valueDisplay: hasEndInv ? `${endInvInput!.inputValue} EA` : '0 EA (Default)',
    actionHref: '/planning-inputs',
  });

  // 5. BOM: Bill of Materials
  const hasBom = Boolean(snapshot.bom && snapshot.bom.lines.length > 0);
  const hasDirectMat = Boolean(snapshot.inputs['MATERIAL_COST_PER_UNIT']);
  const isBomReady = hasBom || hasDirectMat;
  checks.push({
    id: 'bom_resolution',
    category: 'BOM',
    title: 'Bill of Materials (BOM)',
    description: hasBom
      ? `Approved BOM v${snapshot.bom!.versionNumber} with ${snapshot.bom!.lines.length} components`
      : hasDirectMat
      ? `Using direct material cost per unit input (${snapshot.currency} ${snapshot.inputs['MATERIAL_COST_PER_UNIT']!.inputValue})`
      : 'No active BOM or direct unit material cost found',
    isReady: isBomReady,
    severity: 'BLOCKING',
    valueDisplay: hasBom ? `BOM v${snapshot.bom!.versionNumber}` : hasDirectMat ? 'Direct Cost' : 'Missing',
    actionHref: '/master-data/boms',
  });
  if (!isBomReady) blockers.push('Missing approved BOM or MATERIAL_COST_PER_UNIT input.');

  // 6. Routing: Operations & Labor
  const hasRouting = Boolean(snapshot.routing && snapshot.routing.operations.length > 0);
  const hasDirectLabor = Boolean(snapshot.inputs['LABOR_HOURS_PER_UNIT'] && (snapshot.inputs['LABOR_RATE'] || snapshot.inputs['LABOR_HOURLY_RATE']));
  const hasDirectLaborCost = Boolean(snapshot.inputs['LABOR_COST_PER_UNIT']);
  const isRoutingReady = hasRouting || hasDirectLabor || hasDirectLaborCost;
  checks.push({
    id: 'routing_resolution',
    category: 'ROUTING',
    title: 'Manufacturing Routing',
    description: hasRouting
      ? `Approved Routing v${snapshot.routing!.versionNumber} with ${snapshot.routing!.operations.length} operations`
      : hasDirectLabor
      ? 'Using direct labor hours and hourly wage rate inputs'
      : hasDirectLaborCost
      ? 'Using direct labor cost per unit input'
      : 'No active routing or direct labor inputs found',
    isReady: isRoutingReady,
    severity: 'BLOCKING',
    valueDisplay: hasRouting ? `Routing v${snapshot.routing!.versionNumber}` : isRoutingReady ? 'Direct Inputs' : 'Missing',
    actionHref: '/master-data/routings',
  });
  if (!isRoutingReady) blockers.push('Missing approved routing or direct labor inputs.');

  // 7. Overhead: Rate or Allocation
  const hasOverhead = Boolean(snapshot.inputs['OVERHEAD_COST_PER_UNIT'] || snapshot.inputs['FIXED_OVERHEAD']);
  checks.push({
    id: 'overhead_config',
    category: 'OVERHEAD',
    title: 'Manufacturing Overhead',
    description: hasOverhead ? 'Overhead rate/fixed allocation configured' : 'Defaulting to ₹0 overhead allocation',
    isReady: true,
    severity: 'WARNING',
    valueDisplay: hasOverhead ? 'Configured' : '0 (Default)',
    actionHref: '/planning-inputs',
  });
  if (!hasOverhead) warnings.push('No overhead rate or fixed overhead input specified.');

  // 8. Opex: Planned Expenses
  const hasOpex = Boolean(snapshot.opexInputs.length > 0 || snapshot.inputs['MONTHLY_OPEX'] || snapshot.inputs['OPEX_PLANNED_AMOUNT']);
  checks.push({
    id: 'opex_inputs',
    category: 'OPEX',
    title: 'Operating Expenses (Opex)',
    description: hasOpex ? `${snapshot.opexInputs.length > 0 ? `${snapshot.opexInputs.length} accounts configured` : 'Monthly Opex input configured'}` : 'Defaulting to ₹0 operating expenses',
    isReady: true,
    severity: 'WARNING',
    valueDisplay: hasOpex ? 'Configured' : '0 (Default)',
    actionHref: '/planning-inputs',
  });
  if (!hasOpex) warnings.push('No operating expenses configured for this period.');

  const totalChecks = checks.length;
  const passedChecks = checks.filter((c) => c.isReady).length;
  const isReady = blockers.length === 0;
  const scorePercentage = Math.round((passedChecks / totalChecks) * 100);

  return {
    isReady,
    scorePercentage,
    totalChecks,
    passedChecks,
    checks,
    blockers,
    warnings,
  };
}
