'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';

interface PlanningCycle {
  id: string;
  name: string;
  fiscalYear: number;
}

interface PlanVersion {
  id: string;
  versionCode: string;
  versionName: string;
  status: string;
}

interface FiscalPeriod {
  id: string;
  periodName: string;
  periodNumber: number;
  fiscalYear: number;
}

interface Plant {
  id: string;
  code: string;
  name: string;
}

interface Product {
  id: string;
  code: string;
  name: string;
  standardPriceCents: number;
}

interface ReadinessCheck {
  id: string;
  category: string;
  title: string;
  description: string;
  isReady: boolean;
  severity: string;
  valueDisplay?: string;
  actionHref?: string;
}

interface ReadinessReport {
  isReady: boolean;
  scorePercentage: number;
  totalChecks: number;
  passedChecks: number;
  checks: ReadinessCheck[];
  blockers: string[];
  warnings: string[];
}

interface MaterialCostDetail {
  materialId: string;
  materialCode: string;
  materialName: string;
  unitOfMeasure: string;
  quantityPerUnit: number;
  scrapPercentage: number;
  unitPrice: number;
  costPerFinishedUnit: number;
  extendedTotalCost: number;
}

interface LaborCostDetail {
  operationId: string;
  sequence: number;
  operationName: string;
  workCenter: string;
  laborHoursPerUnit: number;
  laborRate: number;
  costPerFinishedUnit: number;
  extendedTotalCost: number;
}

interface OverheadDetail {
  method: string;
  overheadRatePerUnit: number;
  fixedOverheadAmount: number;
  extendedTotalCost: number;
}

interface OpexAccountDetail {
  accountId: string;
  accountCode: string;
  accountName: string;
  plannedAmount: number;
}

interface FinancialResultSummary {
  salesQuantity: number;
  sellingPrice: number;
  revenue: number;
  beginningInventory: number;
  targetEndingInventory: number;
  netProductionQuantity: number;
  grossProductionQuantity: number;
  scrapQuantity: number;
  materialCost: number;
  laborCost: number;
  overheadCost: number;
  totalProductionCost: number;
  standardUnitCost: number;
  cogs: number;
  grossProfit: number;
  grossMarginPercentage: number;
  totalOpex: number;
  operatingProfit: number;
  operatingMarginPercentage: number;
  accountsReceivable: number;
  inventoryValue: number;
  accountsPayable: number;
  netWorkingCapital: number;
  operatingCashFlow: number;
  netChangeInCash: number;
  closingCash: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  balanceSheetImbalance: number;
  materialCostDrillDown: MaterialCostDetail[];
  laborCostDrillDown: LaborCostDetail[];
  overheadDrillDown: OverheadDetail;
  opexDrillDown: OpexAccountDetail[];
}

interface CalculationRun {
  id: string;
  status: string;
  durationMs?: number;
  engineVersion: string;
  errorCount: number;
  warningCount: number;
  startedAt: string;
  completedAt?: string;
  failureReason?: string;
  summary?: FinancialResultSummary;
  startedByUser?: { name: string; email: string };
  plant?: { code: string; name: string };
  product?: { code: string; name: string };
  fiscalPeriod?: { periodName: string };
}

export default function CalculationsPage() {
  // Master data state
  const [cycles, setCycles] = useState<PlanningCycle[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string>('');
  const [versions, setVersions] = useState<PlanVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [plants, setPlants] = useState<Plant[]>([]);
  const [selectedPlantId, setSelectedPlantId] = useState<string>('');
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');

  // Calculation readiness & run state
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [currentRun, setCurrentRun] = useState<CalculationRun | null>(null);
  const [historyRuns, setHistoryRuns] = useState<CalculationRun[]>([]);
  const [activeTab, setActiveTab] = useState<'PL' | 'DRILLDOWN' | 'WORKING_CAPITAL' | 'VALIDATIONS' | 'HISTORY'>('PL');
  const [drilldownSubTab, setDrilldownSubTab] = useState<'MATERIAL' | 'LABOR' | 'OVERHEAD'>('MATERIAL');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showReadinessDetails, setShowReadinessDetails] = useState(false);

  // Load initial dropdowns
  useEffect(() => {
    async function loadMasterData() {
      try {
        const [cyclesRes, plantsRes, productsRes] = await Promise.all([
          fetch('/api/planning/cycles').then((r) => (r.ok ? r.json() : { cycles: [] })),
          fetch('/api/master-data/plants').then((r) => (r.ok ? r.json() : { plants: [] })),
          fetch('/api/master-data/products').then((r) => (r.ok ? r.json() : { products: [] })),
        ]);

        const cList = cyclesRes.cycles || [];
        setCycles(cList);
        if (cList.length > 0) setSelectedCycleId(cList[0].id);

        const plList = plantsRes.plants || [];
        setPlants(plList);
        if (plList.length > 0) setSelectedPlantId(plList[0].id);

        const prList = productsRes.products || [];
        setProducts(prList);
        if (prList.length > 0) setSelectedProductId(prList[0].id);
      } catch (err) {
        console.error('Failed loading master data', err);
      }
    }
    loadMasterData();
  }, []);

  // Load versions and periods when cycle changes
  useEffect(() => {
    if (!selectedCycleId) return;
    async function loadCycleChildren() {
      try {
        const [versionsRes, calRes] = await Promise.all([
          fetch(`/api/planning/cycles/${selectedCycleId}/versions`).then((r) => (r.ok ? r.json() : { versions: [] })),
          fetch('/api/master-data/fiscal-calendar').then((r) => (r.ok ? r.json() : { calendars: [] })),
        ]);

        const vList = versionsRes.versions || [];
        setVersions(vList);
        if (vList.length > 0) setSelectedVersionId(vList[0].id);

        const calList = calRes.calendars || [];
        if (calList.length > 0 && calList[0].periods) {
          setPeriods(calList[0].periods);
          if (calList[0].periods.length > 0) setSelectedPeriodId(calList[0].periods[0].id);
        }
      } catch (err) {
        console.error('Failed loading cycle details', err);
      }
    }
    loadCycleChildren();
  }, [selectedCycleId]);

  // Evaluate readiness when all dimensions are selected
  const fetchReadiness = useCallback(async () => {
    if (!selectedCycleId || !selectedVersionId || !selectedPeriodId || !selectedPlantId || !selectedProductId) {
      return;
    }
    setReadinessLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/planning/calculations/readiness?planningCycleId=${selectedCycleId}&planVersionId=${selectedVersionId}&fiscalPeriodId=${selectedPeriodId}&plantId=${selectedPlantId}&productId=${selectedProductId}`
      );
      if (res.ok) {
        const data = await res.json();
        setReadiness(data.report);
      } else {
        const err = await res.json();
        setErrorMsg(err.error?.message || 'Failed checking readiness');
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Network error');
    } finally {
      setReadinessLoading(false);
    }
  }, [selectedCycleId, selectedVersionId, selectedPeriodId, selectedPlantId, selectedProductId]);

  // Load latest run and history
  const fetchHistory = useCallback(async () => {
    if (!selectedVersionId) return;
    try {
      const [latestRes, listRes] = await Promise.all([
        fetch(
          `/api/planning/calculations/latest?planVersionId=${selectedVersionId}&fiscalPeriodId=${selectedPeriodId}&plantId=${selectedPlantId}&productId=${selectedProductId}`
        ).then((r) => (r.ok ? r.json() : { run: null })),
        fetch(
          `/api/planning/calculations/runs?planVersionId=${selectedVersionId}&limit=20`
        ).then((r) => (r.ok ? r.json() : { runs: [] })),
      ]);

      if (latestRes.run) {
        setCurrentRun(latestRes.run);
      }
      setHistoryRuns(listRes.runs || []);
    } catch (err) {
      console.error('Failed loading history', err);
    }
  }, [selectedVersionId, selectedPeriodId, selectedPlantId, selectedProductId]);

  useEffect(() => {
    fetchReadiness();
    fetchHistory();
  }, [fetchReadiness, fetchHistory]);

  // Execute calculation
  async function handleStartCalculation() {
    if (!selectedCycleId || !selectedVersionId || !selectedPeriodId || !selectedPlantId || !selectedProductId) {
      return;
    }
    setCalculating(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/planning/calculations/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planningCycleId: selectedCycleId,
          planVersionId: selectedVersionId,
          fiscalPeriodId: selectedPeriodId,
          plantId: selectedPlantId,
          productId: selectedProductId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Calculation run failed');
      }

      // Load full run details
      const detailRes = await fetch(`/api/planning/calculations/runs/${data.runId}`);
      if (detailRes.ok) {
        const fullRun = await detailRes.json();
        setCurrentRun(fullRun);
      }
      await fetchHistory();
      await fetchReadiness();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Calculation error');
    } finally {
      setCalculating(false);
    }
  }

  const selectedVersion = versions.find((v) => v.id === selectedVersionId);
  const isVersionLocked = selectedVersion?.status === 'LOCKED';
  const summary = currentRun?.summary;

  const fmtCurrency = (val?: number) => {
    if (val === undefined || val === null) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(val);
  };

  const fmtNumber = (val?: number, decimals = 0) => {
    if (val === undefined || val === null) return '—';
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(val);
  };

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        title="Financial Calculations"
        description="Calculate financial statements from operational inputs, BOMs, and cost drivers."
        breadcrumbs={[
          { label: 'Overview', href: '/' },
          { label: 'Planning', href: '/plans' },
          { label: 'Calculation Engine' },
        ]}
        badge={
          selectedVersion ? (
            <Badge
              variant={
                selectedVersion.status === 'APPROVED'
                  ? 'success'
                  : selectedVersion.status === 'LOCKED'
                  ? 'neutral'
                  : 'primary'
              }
            >
              {selectedVersion.status}
            </Badge>
          ) : undefined
        }
      />

      {errorMsg && (
        <div style={{ marginBottom: 16 }}>
          <Alert variant="danger">{errorMsg}</Alert>
        </div>
      )}

      {/* Dimensional Grain Selector Card */}
      <Card style={{ marginBottom: 20 }}>
        <CardHeader>
          <CardTitle>Calculation Scope</CardTitle>
          <CardDescription>
            Select planning cycle, version, period, plant, and product.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 14,
            }}
          >
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Planning Cycle
              </label>
              <select
                className="input"
                style={{ width: '100%' }}
                value={selectedCycleId}
                onChange={(e) => setSelectedCycleId(e.target.value)}
              >
                {cycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (FY{c.fiscalYear})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Plan Version
              </label>
              <select
                className="input"
                style={{ width: '100%' }}
                value={selectedVersionId}
                onChange={(e) => setSelectedVersionId(e.target.value)}
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.versionCode} - {v.versionName} ({v.status})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Fiscal Period
              </label>
              <select
                className="input"
                style={{ width: '100%' }}
                value={selectedPeriodId}
                onChange={(e) => setSelectedPeriodId(e.target.value)}
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.periodName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Manufacturing Plant
              </label>
              <select
                className="input"
                style={{ width: '100%' }}
                value={selectedPlantId}
                onChange={(e) => setSelectedPlantId(e.target.value)}
              >
                {plants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} - {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Primary Product SKU
              </label>
              <select
                className="input"
                style={{ width: '100%' }}
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} - {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Input Readiness Card */}
      <Card style={{ marginBottom: 20 }}>
        <CardHeader>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <CardTitle>Input Readiness &amp; Master Data Pre-Flight</CardTitle>
                {readiness && (
                  <Badge variant={readiness.isReady ? 'success' : 'danger'}>
                    {readiness.passedChecks} of {readiness.totalChecks} Ready ({readiness.scorePercentage}%)
                  </Badge>
                )}
              </div>
              <CardDescription>
                Validates active BOM versions, approved routings, unit labor rates, and selling prices prior to calculation.
              </CardDescription>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setShowReadinessDetails(!showReadinessDetails)}
              >
                {showReadinessDetails ? 'Hide Details' : 'View Checklist'}
              </button>

              <button
                className="btn btn-primary"
                onClick={handleStartCalculation}
                disabled={calculating || readinessLoading || isVersionLocked || (readiness ? !readiness.isReady : false)}
                style={{ minWidth: 160 }}
              >
                {calculating ? (
                  <span>Executing Pipeline...</span>
                ) : isVersionLocked ? (
                  'Version is Locked'
                ) : (
                  'Calculate Scenario'
                )}
              </button>
            </div>
          </div>
        </CardHeader>

        {showReadinessDetails && readiness && (
          <CardContent style={{ borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              {readiness.checks.map((c) => (
                <div
                  key={c.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 6,
                    border: `1px solid ${c.isReady ? 'var(--border-color)' : '#FCA5A5'}`,
                    backgroundColor: c.isReady ? 'var(--bg-canvas)' : '#FEF2F2',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-heading)' }}>
                      {c.title}
                    </span>
                    <Badge variant={c.isReady ? 'success' : c.severity === 'BLOCKING' ? 'danger' : 'warning'}>
                      {c.isReady ? 'Ready' : c.severity}
                    </Badge>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {c.description}
                  </div>
                  {c.valueDisplay && (
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginTop: 6 }}>
                      Value: <span className="tabular-nums">{c.valueDisplay}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Execution Run Summary Banner */}
      {currentRun && (
        <Card style={{ marginBottom: 20, borderLeft: `4px solid ${currentRun.status === 'COMPLETED' ? '#10B981' : currentRun.status === 'COMPLETED_WITH_WARNINGS' ? '#F59E0B' : '#EF4444'}` }}>
          <CardContent style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Calculation Run #{currentRun.id.slice(-8)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-heading)' }}>
                      Engine v{currentRun.engineVersion}
                    </span>
                    <Badge variant={currentRun.status === 'COMPLETED' ? 'success' : currentRun.status === 'COMPLETED_WITH_WARNINGS' ? 'warning' : 'danger'}>
                      {currentRun.status}
                    </Badge>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Execution Time</div>
                  <div className="tabular-nums" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {currentRun.durationMs ?? 0} ms
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Run Initiated By</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {currentRun.startedByUser?.name || 'Planner'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Errors / Warnings</div>
                  <div className="tabular-nums" style={{ fontSize: 13, fontWeight: 600 }}>
                    <span style={{ color: currentRun.errorCount > 0 ? '#DC2626' : 'var(--text-secondary)' }}>
                      {currentRun.errorCount} Errors
                    </span>
                    {' • '}
                    <span style={{ color: currentRun.warningCount > 0 ? '#D97706' : 'var(--text-secondary)' }}>
                      {currentRun.warningCount} Warnings
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          borderBottom: '1px solid var(--border-color)',
          marginBottom: 20,
        }}
      >
        <button
          onClick={() => setActiveTab('PL')}
          style={{
            padding: '10px 16px',
            fontSize: 13,
            fontWeight: 600,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'PL' ? '2px solid var(--primary-color)' : '2px solid transparent',
            color: activeTab === 'PL' ? 'var(--primary-color)' : 'var(--text-secondary)',
          }}
        >
          Financial Results &amp; P&amp;L
        </button>

        <button
          onClick={() => setActiveTab('DRILLDOWN')}
          style={{
            padding: '10px 16px',
            fontSize: 13,
            fontWeight: 600,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'DRILLDOWN' ? '2px solid var(--primary-color)' : '2px solid transparent',
            color: activeTab === 'DRILLDOWN' ? 'var(--primary-color)' : 'var(--text-secondary)',
          }}
        >
          Cost Drill-Down
        </button>

        <button
          onClick={() => setActiveTab('WORKING_CAPITAL')}
          style={{
            padding: '10px 16px',
            fontSize: 13,
            fontWeight: 600,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'WORKING_CAPITAL' ? '2px solid var(--primary-color)' : '2px solid transparent',
            color: activeTab === 'WORKING_CAPITAL' ? 'var(--primary-color)' : 'var(--text-secondary)',
          }}
        >
          Working Capital &amp; Cash Flow
        </button>

        <button
          onClick={() => setActiveTab('VALIDATIONS')}
          style={{
            padding: '10px 16px',
            fontSize: 13,
            fontWeight: 600,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'VALIDATIONS' ? '2px solid var(--primary-color)' : '2px solid transparent',
            color: activeTab === 'VALIDATIONS' ? 'var(--primary-color)' : 'var(--text-secondary)',
          }}
        >
          Validation Log ({currentRun?.warningCount ?? 0 + (currentRun?.errorCount ?? 0)})
        </button>

        <button
          onClick={() => setActiveTab('HISTORY')}
          style={{
            padding: '10px 16px',
            fontSize: 13,
            fontWeight: 600,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'HISTORY' ? '2px solid var(--primary-color)' : '2px solid transparent',
            color: activeTab === 'HISTORY' ? 'var(--primary-color)' : 'var(--text-secondary)',
          }}
        >
          Run History ({historyRuns.length})
        </button>
      </div>

      {/* Tab 1: Financial Results & P&L Statement */}
      {activeTab === 'PL' && (
        <div>
          {/* KPI Metrics Strip */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16,
              marginBottom: 20,
            }}
          >
            <Card>
              <CardContent style={{ padding: '16px 20px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Gross Revenue</div>
                <div className="tabular-nums" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-heading)', marginTop: 4 }}>
                  {fmtCurrency(summary?.revenue)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {fmtNumber(summary?.salesQuantity)} units @ {fmtCurrency(summary?.sellingPrice)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent style={{ padding: '16px 20px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Cost of Goods Sold</div>
                <div className="tabular-nums" style={{ fontSize: 22, fontWeight: 700, color: '#DC2626', marginTop: 4 }}>
                  {fmtCurrency(summary?.cogs)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  Std Unit Cost: {fmtCurrency(summary?.standardUnitCost)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent style={{ padding: '16px 20px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Gross Profit</div>
                <div className="tabular-nums" style={{ fontSize: 22, fontWeight: 700, color: '#16A34A', marginTop: 4 }}>
                  {fmtCurrency(summary?.grossProfit)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  Margin: <span className="tabular-nums">{fmtNumber(summary?.grossMarginPercentage, 1)}%</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent style={{ padding: '16px 20px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Operating Expenses</div>
                <div className="tabular-nums" style={{ fontSize: 22, fontWeight: 700, color: '#DC2626', marginTop: 4 }}>
                  {fmtCurrency(summary?.totalOpex)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  Planned SG&amp;A Allocation
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent style={{ padding: '16px 20px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Operating Profit (EBIT)</div>
                <div className="tabular-nums" style={{ fontSize: 22, fontWeight: 700, color: '#16A34A', marginTop: 4 }}>
                  {fmtCurrency(summary?.operatingProfit)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  Operating Margin: <span className="tabular-nums">{fmtNumber(summary?.operatingMarginPercentage, 1)}%</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Statement Table */}
          <Card>
            <CardHeader>
              <CardTitle>Manufacturing Income Statement (P&amp;L)</CardTitle>
              <CardDescription>
                Standard absorption manufacturing costing statement.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', textAlign: 'left' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '50%' }}>Financial Line Item</th>
                      <th style={{ width: '25%', textAlign: 'right' }}>Unit Rate / Driver</th>
                      <th style={{ width: '25%', textAlign: 'right' }}>Total Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ backgroundColor: 'var(--bg-canvas)' }}>
                      <td style={{ fontWeight: 600 }}>Planned Sales Quantity</td>
                      <td style={{ textAlign: 'right' }}>—</td>
                      <td className="tabular-nums" style={{ textAlign: 'right', fontWeight: 600 }}>
                        {fmtNumber(summary?.salesQuantity)} EA
                      </td>
                    </tr>
                    <tr>
                      <td style={{ paddingLeft: 24 }}>Commercial Selling Price</td>
                      <td style={{ textAlign: 'right' }}>—</td>
                      <td className="tabular-nums" style={{ textAlign: 'right' }}>{fmtCurrency(summary?.sellingPrice)} / EA</td>
                    </tr>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', fontWeight: 700 }}>
                      <td>Gross Revenue</td>
                      <td style={{ textAlign: 'right' }}>—</td>
                      <td className="tabular-nums" style={{ textAlign: 'right', color: '#1E40AF' }}>
                        {fmtCurrency(summary?.revenue)}
                      </td>
                    </tr>

                    <tr>
                      <td style={{ fontWeight: 600, paddingTop: 16 }}>Cost of Goods Sold (COGS)</td>
                      <td style={{ textAlign: 'right' }}></td>
                      <td style={{ textAlign: 'right' }}></td>
                    </tr>
                    <tr>
                      <td style={{ paddingLeft: 24 }}>Direct Raw Materials</td>
                      <td className="tabular-nums" style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                        {fmtCurrency((summary?.materialCost ?? 0) / (summary?.grossProductionQuantity || 1))} / EA
                      </td>
                      <td className="tabular-nums" style={{ textAlign: 'right' }}>{fmtCurrency(summary?.materialCost)}</td>
                    </tr>
                    <tr>
                      <td style={{ paddingLeft: 24 }}>Direct Assembly Labor</td>
                      <td className="tabular-nums" style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                        {fmtCurrency((summary?.laborCost ?? 0) / (summary?.grossProductionQuantity || 1))} / EA
                      </td>
                      <td className="tabular-nums" style={{ textAlign: 'right' }}>{fmtCurrency(summary?.laborCost)}</td>
                    </tr>
                    <tr>
                      <td style={{ paddingLeft: 24 }}>Manufacturing Overhead Allocated</td>
                      <td className="tabular-nums" style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                        {fmtCurrency((summary?.overheadCost ?? 0) / (summary?.grossProductionQuantity || 1))} / EA
                      </td>
                      <td className="tabular-nums" style={{ textAlign: 'right' }}>{fmtCurrency(summary?.overheadCost)}</td>
                    </tr>
                    <tr style={{ backgroundColor: 'var(--bg-canvas)' }}>
                      <td style={{ fontWeight: 600, paddingLeft: 24 }}>Total Cost of Goods Manufactured (COGM)</td>
                      <td className="tabular-nums" style={{ textAlign: 'right', fontWeight: 600 }}>
                        {fmtNumber(summary?.grossProductionQuantity)} Units Produced
                      </td>
                      <td className="tabular-nums" style={{ textAlign: 'right', fontWeight: 600 }}>
                        {fmtCurrency(summary?.totalProductionCost)}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                      <td style={{ fontWeight: 600 }}>Standard Cost of Goods Sold (Units Sold × Std Cost)</td>
                      <td className="tabular-nums" style={{ textAlign: 'right', fontWeight: 600 }}>
                        Std Cost: {fmtCurrency(summary?.standardUnitCost)}
                      </td>
                      <td className="tabular-nums" style={{ textAlign: 'right', fontWeight: 700, color: '#DC2626' }}>
                        {fmtCurrency(summary?.cogs)}
                      </td>
                    </tr>

                    <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid var(--border-color)', fontWeight: 700 }}>
                      <td>Gross Profit</td>
                      <td className="tabular-nums" style={{ textAlign: 'right', color: '#16A34A' }}>
                        {fmtNumber(summary?.grossMarginPercentage, 2)}% Margin
                      </td>
                      <td className="tabular-nums" style={{ textAlign: 'right', color: '#16A34A', fontSize: 16 }}>
                        {fmtCurrency(summary?.grossProfit)}
                      </td>
                    </tr>

                    <tr>
                      <td style={{ fontWeight: 600, paddingTop: 16 }}>Operating Expenses (SG&amp;A)</td>
                      <td style={{ textAlign: 'right' }}></td>
                      <td style={{ textAlign: 'right' }}></td>
                    </tr>
                    {summary?.opexDrillDown && summary.opexDrillDown.length > 0 ? (
                      summary.opexDrillDown.map((item, i) => (
                        <tr key={i}>
                          <td style={{ paddingLeft: 24 }}>{item.accountName}</td>
                          <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{item.accountCode}</td>
                          <td className="tabular-nums" style={{ textAlign: 'right' }}>{fmtCurrency(item.plannedAmount)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td style={{ paddingLeft: 24 }}>General &amp; Administrative Expenses</td>
                        <td style={{ textAlign: 'right' }}>Fixed</td>
                        <td className="tabular-nums" style={{ textAlign: 'right' }}>{fmtCurrency(summary?.totalOpex)}</td>
                      </tr>
                    )}
                    <tr style={{ borderBottom: '2px solid var(--border-color)', fontWeight: 600 }}>
                      <td>Total Operating Expenses</td>
                      <td style={{ textAlign: 'right' }}>—</td>
                      <td className="tabular-nums" style={{ textAlign: 'right', color: '#DC2626' }}>
                        {fmtCurrency(summary?.totalOpex)}
                      </td>
                    </tr>

                    <tr style={{ backgroundColor: '#F1F5F9', fontWeight: 800, fontSize: 16 }}>
                      <td>Operating Profit (EBIT)</td>
                      <td className="tabular-nums" style={{ textAlign: 'right', color: '#1E40AF', fontSize: 14 }}>
                        {fmtNumber(summary?.operatingMarginPercentage, 2)}% Operating Margin
                      </td>
                      <td className="tabular-nums" style={{ textAlign: 'right', color: '#1E40AF' }}>
                        {fmtCurrency(summary?.operatingProfit)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 2: Cost Drill-Down */}
      {activeTab === 'DRILLDOWN' && (
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <div>
                <CardTitle>Manufacturing Cost Drill-Down</CardTitle>
                <CardDescription>
                  Trace every dollar of product cost to individual BOM components, routing operations, and overhead rates.
                </CardDescription>
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className={`btn btn-sm ${drilldownSubTab === 'MATERIAL' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setDrilldownSubTab('MATERIAL')}
                >
                  Raw Materials ({summary?.materialCostDrillDown?.length ?? 0})
                </button>
                <button
                  className={`btn btn-sm ${drilldownSubTab === 'LABOR' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setDrilldownSubTab('LABOR')}
                >
                  Assembly Labor ({summary?.laborCostDrillDown?.length ?? 0})
                </button>
                <button
                  className={`btn btn-sm ${drilldownSubTab === 'OVERHEAD' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setDrilldownSubTab('OVERHEAD')}
                >
                  Overhead
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {drilldownSubTab === 'MATERIAL' && (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Component SKU</th>
                      <th>Description</th>
                      <th style={{ textAlign: 'right' }}>BOM Qty / Unit</th>
                      <th style={{ textAlign: 'right' }}>Scrap %</th>
                      <th style={{ textAlign: 'right' }}>Material Unit Price</th>
                      <th style={{ textAlign: 'right' }}>Cost / Finished Unit</th>
                      <th style={{ textAlign: 'right' }}>Extended Total Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary?.materialCostDrillDown && summary.materialCostDrillDown.length > 0 ? (
                      summary.materialCostDrillDown.map((item, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{item.materialCode}</td>
                          <td>{item.materialName}</td>
                          <td className="tabular-nums" style={{ textAlign: 'right' }}>
                            {item.quantityPerUnit} {item.unitOfMeasure}
                          </td>
                          <td className="tabular-nums" style={{ textAlign: 'right' }}>
                            {item.scrapPercentage}%
                          </td>
                          <td className="tabular-nums" style={{ textAlign: 'right' }}>
                            {fmtCurrency(item.unitPrice)}
                          </td>
                          <td className="tabular-nums" style={{ textAlign: 'right', fontWeight: 600 }}>
                            {fmtCurrency(item.costPerFinishedUnit)}
                          </td>
                          <td className="tabular-nums" style={{ textAlign: 'right', fontWeight: 700, color: '#1E40AF' }}>
                            {fmtCurrency(item.extendedTotalCost)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                          No BOM component records available for this run.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {summary?.materialCostDrillDown && summary.materialCostDrillDown.length > 0 && (
                    <tfoot>
                      <tr style={{ backgroundColor: 'var(--bg-canvas)', fontWeight: 700 }}>
                        <td colSpan={5}>Total Direct Materials</td>
                        <td className="tabular-nums" style={{ textAlign: 'right' }}>
                          {fmtCurrency(summary.materialCostDrillDown.reduce((s, it) => s + it.costPerFinishedUnit, 0))}
                        </td>
                        <td className="tabular-nums" style={{ textAlign: 'right', color: '#1E40AF' }}>
                          {fmtCurrency(summary.materialCost)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {drilldownSubTab === 'LABOR' && (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Seq</th>
                      <th>Operation Name</th>
                      <th>Work Center</th>
                      <th style={{ textAlign: 'right' }}>Labor Hours / Unit</th>
                      <th style={{ textAlign: 'right' }}>Hourly Wage Rate</th>
                      <th style={{ textAlign: 'right' }}>Cost / Finished Unit</th>
                      <th style={{ textAlign: 'right' }}>Extended Total Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary?.laborCostDrillDown && summary.laborCostDrillDown.length > 0 ? (
                      summary.laborCostDrillDown.map((item, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{item.sequence}</td>
                          <td>{item.operationName}</td>
                          <td>
                            <Badge variant="neutral">{item.workCenter}</Badge>
                          </td>
                          <td className="tabular-nums" style={{ textAlign: 'right' }}>
                            {item.laborHoursPerUnit} hrs
                          </td>
                          <td className="tabular-nums" style={{ textAlign: 'right' }}>
                            {fmtCurrency(item.laborRate)} / hr
                          </td>
                          <td className="tabular-nums" style={{ textAlign: 'right', fontWeight: 600 }}>
                            {fmtCurrency(item.costPerFinishedUnit)}
                          </td>
                          <td className="tabular-nums" style={{ textAlign: 'right', fontWeight: 700, color: '#1E40AF' }}>
                            {fmtCurrency(item.extendedTotalCost)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                          No labor operation records available for this run.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {summary?.laborCostDrillDown && summary.laborCostDrillDown.length > 0 && (
                    <tfoot>
                      <tr style={{ backgroundColor: 'var(--bg-canvas)', fontWeight: 700 }}>
                        <td colSpan={5}>Total Direct Assembly Labor</td>
                        <td className="tabular-nums" style={{ textAlign: 'right' }}>
                          {fmtCurrency(summary.laborCostDrillDown.reduce((s, it) => s + it.costPerFinishedUnit, 0))}
                        </td>
                        <td className="tabular-nums" style={{ textAlign: 'right', color: '#1E40AF' }}>
                          {fmtCurrency(summary.laborCost)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {drilldownSubTab === 'OVERHEAD' && (
              <div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: 16,
                  }}
                >
                  <div style={{ padding: 16, border: '1px solid var(--border-color)', borderRadius: 6 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Allocation Methodology</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-heading)', marginTop: 4 }}>
                      {summary?.overheadDrillDown?.method === 'UNIT_RATE' ? 'Unit-Based Standard Allocation' : 'Fixed Periodic Allocation'}
                    </div>
                  </div>

                  <div style={{ padding: 16, border: '1px solid var(--border-color)', borderRadius: 6 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Overhead Rate per Unit</div>
                    <div className="tabular-nums" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-heading)', marginTop: 4 }}>
                      {fmtCurrency(summary?.overheadDrillDown?.overheadRatePerUnit)} / EA
                    </div>
                  </div>

                  <div style={{ padding: 16, border: '1px solid var(--border-color)', borderRadius: 6 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Fixed Manufacturing Overhead</div>
                    <div className="tabular-nums" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-heading)', marginTop: 4 }}>
                      {fmtCurrency(summary?.overheadDrillDown?.fixedOverheadAmount)}
                    </div>
                  </div>

                  <div style={{ padding: 16, border: '1px solid var(--border-color)', borderRadius: 6 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total Extended Overhead</div>
                    <div className="tabular-nums" style={{ fontSize: 16, fontWeight: 700, color: '#1E40AF', marginTop: 4 }}>
                      {fmtCurrency(summary?.overheadCost)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab 3: Working Capital & Cash Flow */}
      {activeTab === 'WORKING_CAPITAL' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 20 }}>
          <Card>
            <CardHeader>
              <CardTitle>Working Capital Breakdown</CardTitle>
              <CardDescription>Accounts receivable, finished goods inventory valuation, and trade payables.</CardDescription>
            </CardHeader>
            <CardContent>
              <table className="table" style={{ width: '100%' }}>
                <tbody>
                  <tr>
                    <td>Accounts Receivable (DSO)</td>
                    <td className="tabular-nums" style={{ textAlign: 'right', fontWeight: 600 }}>
                      {fmtCurrency(summary?.accountsReceivable)}
                    </td>
                  </tr>
                  <tr>
                    <td>Finished Goods Inventory Valuation</td>
                    <td className="tabular-nums" style={{ textAlign: 'right', fontWeight: 600 }}>
                      {fmtCurrency(summary?.inventoryValue)}
                    </td>
                  </tr>
                  <tr>
                    <td>Accounts Payable (DPO)</td>
                    <td className="tabular-nums" style={{ textAlign: 'right', fontWeight: 600, color: '#DC2626' }}>
                      ({fmtCurrency(summary?.accountsPayable)})
                    </td>
                  </tr>
                  <tr style={{ backgroundColor: 'var(--bg-canvas)', fontWeight: 800 }}>
                    <td>Net Working Capital</td>
                    <td className="tabular-nums" style={{ textAlign: 'right', color: '#1E40AF' }}>
                      {fmtCurrency(summary?.netWorkingCapital)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cash Flow &amp; Balance Reconciliation</CardTitle>
              <CardDescription>Operating cash generation and balance sheet assets vs. liabilities check.</CardDescription>
            </CardHeader>
            <CardContent>
              <table className="table" style={{ width: '100%' }}>
                <tbody>
                  <tr>
                    <td>Operating Cash Flow</td>
                    <td className="tabular-nums" style={{ textAlign: 'right', fontWeight: 600, color: '#16A34A' }}>
                      {fmtCurrency(summary?.operatingCashFlow)}
                    </td>
                  </tr>
                  <tr>
                    <td>Net Change in Cash</td>
                    <td className="tabular-nums" style={{ textAlign: 'right', fontWeight: 600 }}>
                      {fmtCurrency(summary?.netChangeInCash)}
                    </td>
                  </tr>
                  <tr>
                    <td>Closing Cash Balance</td>
                    <td className="tabular-nums" style={{ textAlign: 'right', fontWeight: 700, color: '#1E40AF' }}>
                      {fmtCurrency(summary?.closingCash)}
                    </td>
                  </tr>
                  <tr style={{ backgroundColor: 'var(--bg-canvas)' }}>
                    <td>Total Assets</td>
                    <td className="tabular-nums" style={{ textAlign: 'right', fontWeight: 600 }}>
                      {fmtCurrency(summary?.totalAssets)}
                    </td>
                  </tr>
                  <tr style={{ backgroundColor: 'var(--bg-canvas)' }}>
                    <td>Total Liabilities + Equity</td>
                    <td className="tabular-nums" style={{ textAlign: 'right', fontWeight: 600 }}>
                      {fmtCurrency((summary?.totalLiabilities ?? 0) + (summary?.totalEquity ?? 0))}
                    </td>
                  </tr>
                  <tr style={{ fontWeight: 700 }}>
                    <td>Balance Sheet Discrepancy</td>
                    <td
                      className="tabular-nums"
                      style={{
                        textAlign: 'right',
                        color: summary?.balanceSheetImbalance && Math.abs(summary.balanceSheetImbalance) > 0.01 ? '#DC2626' : '#16A34A',
                      }}
                    >
                      {fmtCurrency(summary?.balanceSheetImbalance)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 4: Validation Log */}
      {activeTab === 'VALIDATIONS' && (
        <Card>
          <CardHeader>
            <CardTitle>Calculation Run Integrity &amp; Validation Messages</CardTitle>
            <CardDescription>
              Actionable audit messages, formula boundary checks, and master data warnings emitted during execution.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {readiness && readiness.warnings.length === 0 && readiness.blockers.length === 0 && (currentRun?.warningCount === 0 && currentRun?.errorCount === 0) ? (
              <div style={{ textAlign: 'center', padding: 32, color: '#16A34A' }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>Calculation Completed Successfully</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                  Zero validation errors or warnings detected in the execution pipeline.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {readiness?.blockers.map((b, i) => (
                  <Alert key={`b-${i}`} variant="danger">
                    <strong>Pre-Flight Blocker:</strong> {b}
                  </Alert>
                ))}
                {readiness?.warnings.map((w, i) => (
                  <Alert key={`w-${i}`} variant="warning">
                    <strong>Pre-Flight Warning:</strong> {w}
                  </Alert>
                ))}
                {currentRun?.failureReason && (
                  <Alert variant="danger">
                    <strong>Run Failure:</strong> {currentRun.failureReason}
                  </Alert>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab 5: Run History */}
      {activeTab === 'HISTORY' && (
        <Card>
          <CardHeader>
            <CardTitle>Historical Calculation Runs</CardTitle>
            <CardDescription>Audit trail of calculation runs for this plan version.</CardDescription>
          </CardHeader>
          <CardContent>
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Run ID</th>
                    <th>Status</th>
                    <th>Period</th>
                    <th>Plant / SKU</th>
                    <th>Initiated By</th>
                    <th style={{ textAlign: 'right' }}>Duration</th>
                    <th style={{ textAlign: 'right' }}>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRuns.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>#{r.id.slice(-8)}</td>
                      <td>
                        <Badge variant={r.status === 'COMPLETED' ? 'success' : r.status === 'COMPLETED_WITH_WARNINGS' ? 'warning' : 'danger'}>
                          {r.status}
                        </Badge>
                      </td>
                      <td>{r.fiscalPeriod?.periodName || 'Period'}</td>
                      <td>
                        {r.plant?.code} / {r.product?.code}
                      </td>
                      <td>{r.startedByUser?.name || 'Planner'}</td>
                      <td className="tabular-nums" style={{ textAlign: 'right' }}>
                        {r.durationMs ?? 0} ms
                      </td>
                      <td className="tabular-nums" style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                        {new Date(r.startedAt).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
