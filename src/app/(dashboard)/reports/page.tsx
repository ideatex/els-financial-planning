'use client';

import React, { useState, useEffect } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';

type ReportTab = 'pnl' | 'revenue' | 'production' | 'materials' | 'labor' | 'opex' | 'summary';

export default function FinancialReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportTab>('pnl');

  const [cycles, setCycles] = useState<Array<{ id: string; name: string }>>([]);
  const [versions, setVersions] = useState<Array<{ id: string; versionCode: string; versionName: string; status: string }>>([]);
  const [periods, setPeriods] = useState<Array<{ id: string; periodName: string }>>([]);
  const [plants, setPlants] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [products, setProducts] = useState<Array<{ id: string; name: string; code: string }>>([]);

  const [selectedCycleId, setSelectedCycleId] = useState('');
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [selectedPlantId, setSelectedPlantId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<any>(null);

  useEffect(() => {
    loadMetadata();
  }, []);

  useEffect(() => {
    if (selectedCycleId) loadVersions(selectedCycleId);
  }, [selectedCycleId]);

  useEffect(() => {
    if (selectedVersionId && selectedPeriodId) {
      loadReport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVersionId, selectedPeriodId, selectedPlantId, selectedProductId, activeTab]);

  async function loadMetadata() {
    try {
      const [cyclesRes, periodsRes, plantsRes, productsRes] = await Promise.all([
        fetch('/api/planning/cycles'),
        fetch('/api/master-data/fiscal-calendar'),
        fetch('/api/master-data/plants'),
        fetch('/api/master-data/products'),
      ]);

      if (cyclesRes.ok) {
        const cData = await cyclesRes.json();
        const cycleList = Array.isArray(cData) ? cData : (cData.cycles || []);
        setCycles(cycleList);
        if (cycleList.length > 0) setSelectedCycleId(cycleList[0].id);
      }

      if (periodsRes.ok) {
        const pData = await periodsRes.json();
        const calendars = Array.isArray(pData) ? pData : (pData.calendars || []);
        const allPeriods = calendars.flatMap((c: any) => c.periods || []).map((p: any) => ({
          id: p.id,
          periodName: p.periodName,
        }));
        setPeriods(allPeriods);
        if (allPeriods.length > 0) setSelectedPeriodId(allPeriods[0].id);
      }

      if (plantsRes.ok) {
        const plData = await plantsRes.json();
        setPlants(Array.isArray(plData) ? plData : (plData.plants || []));
      }
      if (productsRes.ok) {
        const prData = await productsRes.json();
        setProducts(Array.isArray(prData) ? prData : (prData.products || []));
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function loadVersions(cycleId: string) {
    try {
      const res = await fetch(`/api/planning/cycles/${cycleId}/versions`);
      if (res.ok) {
        const data = await res.json();
        const versionList = Array.isArray(data) ? data : (data.versions || []);
        setVersions(versionList);
        if (versionList.length > 0) {
          const approved = versionList.find((v: any) => v.status === 'APPROVED' || v.status === 'LOCKED');
          setSelectedVersionId(approved ? approved.id : versionList[0].id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function loadReport() {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        planVersionId: selectedVersionId,
        fiscalPeriodId: selectedPeriodId,
      });
      if (selectedPlantId) query.set('plantId', selectedPlantId);
      if (selectedProductId) query.set('productId', selectedProductId);

      const endpoint = `/api/reports/${activeTab}?${query.toString()}`;
      const res = await fetch(endpoint);
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error?.message || 'Failed to generate report statement');
      }

      const data = await res.json();
      setReportData(data);
    } catch (err: any) {
      setError(err.message);
      setReportData(null);
    } finally {
      setLoading(false);
    }
  }

  function handleExportCsv() {
    if (!selectedVersionId || !selectedPeriodId) return;
    const query = new URLSearchParams({
      planVersionId: selectedVersionId,
      fiscalPeriodId: selectedPeriodId,
      type: activeTab,
    });
    if (selectedPlantId) query.set('plantId', selectedPlantId);
    if (selectedProductId) query.set('productId', selectedProductId);
    window.open(`/api/reports/export?${query.toString()}`, '_blank');
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Financial and operational statements across plan versions and fiscal periods."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleExportCsv} disabled={!reportData}>
              <span className="flex items-center gap-1.5">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export CSV Report
              </span>
            </Button>
            <Button variant="primary" onClick={loadReport}>
              Refresh Statement
            </Button>
          </div>
        }
      />

      {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

      {/* Dimensional Selectors */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <Select
            label="Planning Cycle"
            value={selectedCycleId}
            onChange={(e) => setSelectedCycleId(e.target.value)}
            options={(cycles || []).map((c) => ({ value: c.id, label: c.name }))}
          />
          <Select
            label="Plan Version"
            value={selectedVersionId}
            onChange={(e) => setSelectedVersionId(e.target.value)}
            options={(versions || []).map((v) => ({
              value: v.id,
              label: `${v.versionCode} (${v.status})`,
            }))}
          />
          <Select
            label="Fiscal Period"
            value={selectedPeriodId}
            onChange={(e) => setSelectedPeriodId(e.target.value)}
            options={(periods || []).map((p) => ({ value: p.id, label: p.periodName }))}
          />
          <Select
            label="Plant (Optional)"
            value={selectedPlantId}
            onChange={(e) => setSelectedPlantId(e.target.value)}
            options={[{ value: '', label: 'All Plants' }, ...(plants || []).map((pl) => ({ value: pl.id, label: `${pl.code} - ${pl.name}` }))]}
          />
          <Select
            label="Product (Optional)"
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
            options={[{ value: '', label: 'All Products' }, ...(products || []).map((pr) => ({ value: pr.id, label: `${pr.code} - ${pr.name}` }))]}
          />
        </div>
      </Card>

      {/* Report Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto">
        <button
          className={`px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 ${
            activeTab === 'pnl' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
          onClick={() => setActiveTab('pnl')}
        >
          Income Statement (P&L)
        </button>
        <button
          className={`px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 ${
            activeTab === 'revenue' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
          onClick={() => setActiveTab('revenue')}
        >
          Revenue & Price-Volume
        </button>
        <button
          className={`px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 ${
            activeTab === 'production' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
          onClick={() => setActiveTab('production')}
        >
          Production & Volume
        </button>
        <button
          className={`px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 ${
            activeTab === 'materials' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
          onClick={() => setActiveTab('materials')}
        >
          Direct Materials
        </button>
        <button
          className={`px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 ${
            activeTab === 'labor' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
          onClick={() => setActiveTab('labor')}
        >
          Direct Labor
        </button>
        <button
          className={`px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 ${
            activeTab === 'opex' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
          onClick={() => setActiveTab('opex')}
        >
          Operating Expenses
        </button>
        <button
          className={`px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 ${
            activeTab === 'summary' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
          onClick={() => setActiveTab('summary')}
        >
          Executive Variance Summary
        </button>
      </div>

      {/* Report Content Container */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Generating real-time financial report...</div>
        ) : !reportData ? (
          <div className="p-12 text-center">
            <EmptyState
              title="No report data generated"
              description="Please select a valid plan version and fiscal period with completed calculations and actuals."
            />
          </div>
        ) : (
          <div>
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
              <div>
                <h2 className="text-base font-bold text-slate-900">{reportData.reportTitle}</h2>
                <div className="text-xs text-slate-500 mt-0.5">
                  Period: <strong>{reportData.fiscalPeriod?.periodName}</strong> • Version: <strong>{reportData.planVersion?.versionCode}</strong> • Currency: <strong>{reportData.currency}</strong>
                </div>
              </div>
              <div className="text-xs text-slate-400 font-mono">
                Generated: {new Date(reportData.generatedAt).toLocaleTimeString()}
              </div>
            </div>

            {/* P&L Statement View */}
            {activeTab === 'pnl' && reportData.lines && (
              <div className="p-6">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b-2 border-slate-300 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      <th className="py-2.5">Line Item</th>
                      <th className="py-2.5 text-right">Plan Target</th>
                      <th className="py-2.5 text-right">Actual Incurred</th>
                      <th className="py-2.5 text-right">Variance (Δ)</th>
                      <th className="py-2.5 text-right">% Variance</th>
                      <th className="py-2.5 text-center">Favorability</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData.lines.map((l: any) => {
                      const isBold = ['REVENUE', 'GROSS_PROFIT', 'OPERATING_PROFIT'].includes(l.metricCode);
                      return (
                        <tr key={l.metricCode} className={`hover:bg-slate-50/80 ${isBold ? 'bg-slate-50/40 font-semibold' : ''}`}>
                          <td className="py-3 text-slate-900">{l.metricName}</td>
                          <td className="py-3 text-right font-mono tabular-nums text-slate-700">
                            {reportData.currency} {l.planValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 text-right font-mono tabular-nums text-slate-900">
                            {reportData.currency} {l.actualValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td
                            className={`py-3 text-right font-mono tabular-nums ${
                              l.favorability === 'FAVORABLE'
                                ? 'text-emerald-700'
                                : l.favorability === 'UNFAVORABLE'
                                ? 'text-rose-700'
                                : 'text-slate-600'
                            }`}
                          >
                            {l.varianceAmount >= 0 ? '+' : ''}
                            {reportData.currency} {l.varianceAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 text-right font-mono text-xs tabular-nums text-slate-700">
                            {l.variancePercent !== null ? `${l.variancePercent >= 0 ? '+' : ''}${l.variancePercent}%` : 'N/A'}
                          </td>
                          <td className="py-3 text-center">
                            <Badge
                              variant={
                                l.favorability === 'FAVORABLE'
                                  ? 'success'
                                  : l.favorability === 'UNFAVORABLE'
                                  ? 'danger'
                                  : 'neutral'
                              }
                            >
                              {l.favorability}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Revenue Report View */}
            {activeTab === 'revenue' && reportData.revenueMetric && (
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-slate-50 rounded border border-slate-200">
                    <span className="text-xs text-slate-500 uppercase font-semibold">Total Revenue Variance</span>
                    <div className="mt-1 text-2xl font-bold font-mono text-slate-900">
                      {reportData.currency} {reportData.revenueMetric.varianceAmount.toLocaleString()}
                    </div>
                    <Badge variant={reportData.revenueMetric.favorability === 'FAVORABLE' ? 'success' : 'danger'}>
                      {reportData.revenueMetric.favorability} ({reportData.revenueMetric.variancePercent}%)
                    </Badge>
                  </div>

                  <div className="p-4 bg-slate-50 rounded border border-slate-200">
                    <span className="text-xs text-slate-500 uppercase font-semibold">Volume Variance</span>
                    <div className="mt-1 text-2xl font-bold font-mono text-slate-900">
                      {reportData.currency} {(reportData.decomposition?.volumeVariance ?? 0).toLocaleString()}
                    </div>
                    <span className="text-xs text-slate-400 mt-1 block">(Actual Qty - Plan Qty) × Plan Price</span>
                  </div>

                  <div className="p-4 bg-slate-50 rounded border border-slate-200">
                    <span className="text-xs text-slate-500 uppercase font-semibold">Price Variance</span>
                    <div className="mt-1 text-2xl font-bold font-mono text-slate-900">
                      {reportData.currency} {(reportData.decomposition?.priceVariance ?? 0).toLocaleString()}
                    </div>
                    <span className="text-xs text-slate-400 mt-1 block">Actual Qty × (Actual Price - Plan Price)</span>
                  </div>
                </div>
              </div>
            )}

            {/* Production Report View */}
            {activeTab === 'production' && reportData.productionMetric && (
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded border border-slate-200">
                    <span className="text-xs text-slate-500 uppercase font-semibold">Planned Production Volume</span>
                    <div className="mt-1 text-2xl font-bold font-mono text-slate-900">
                      {reportData.productionMetric.planValue.toLocaleString()} EA
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded border border-slate-200">
                    <span className="text-xs text-slate-500 uppercase font-semibold">Actual Production Incurred</span>
                    <div className="mt-1 text-2xl font-bold font-mono text-slate-900">
                      {reportData.productionMetric.actualValue.toLocaleString()} EA
                    </div>
                    <Badge variant={reportData.productionMetric.favorability === 'FAVORABLE' ? 'success' : 'danger'}>
                      Variance: {reportData.productionMetric.varianceAmount >= 0 ? '+' : ''}{reportData.productionMetric.varianceAmount} EA
                    </Badge>
                  </div>
                </div>
              </div>
            )}

            {/* Material Report View */}
            {activeTab === 'materials' && reportData.materialMetric && (
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded border border-slate-200">
                    <span className="text-xs text-slate-500 uppercase font-semibold">Direct Material Budget</span>
                    <div className="mt-1 text-2xl font-bold font-mono text-slate-900">
                      {reportData.currency} {reportData.materialMetric.planValue.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded border border-slate-200">
                    <span className="text-xs text-slate-500 uppercase font-semibold">Actual Material Incurred</span>
                    <div className="mt-1 text-2xl font-bold font-mono text-slate-900">
                      {reportData.currency} {reportData.materialMetric.actualValue.toLocaleString()}
                    </div>
                    <Badge variant={reportData.materialMetric.favorability === 'FAVORABLE' ? 'success' : 'danger'}>
                      {reportData.materialMetric.favorability} ({reportData.materialMetric.variancePercent}%)
                    </Badge>
                  </div>
                </div>
              </div>
            )}

            {/* Labor Report View */}
            {activeTab === 'labor' && reportData.laborMetric && (
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded border border-slate-200">
                    <span className="text-xs text-slate-500 uppercase font-semibold">Direct Labor Budget</span>
                    <div className="mt-1 text-2xl font-bold font-mono text-slate-900">
                      {reportData.currency} {reportData.laborMetric.planValue.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded border border-slate-200">
                    <span className="text-xs text-slate-500 uppercase font-semibold">Actual Labor Incurred</span>
                    <div className="mt-1 text-2xl font-bold font-mono text-slate-900">
                      {reportData.currency} {reportData.laborMetric.actualValue.toLocaleString()}
                    </div>
                    <Badge variant={reportData.laborMetric.favorability === 'FAVORABLE' ? 'success' : 'danger'}>
                      {reportData.laborMetric.favorability} ({reportData.laborMetric.variancePercent}%)
                    </Badge>
                  </div>
                </div>
              </div>
            )}

            {/* Opex Report View */}
            {activeTab === 'opex' && reportData.opexMetric && (
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded border border-slate-200">
                    <span className="text-xs text-slate-500 uppercase font-semibold">Planned Operating Expenses</span>
                    <div className="mt-1 text-2xl font-bold font-mono text-slate-900">
                      {reportData.currency} {reportData.opexMetric.planValue.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded border border-slate-200">
                    <span className="text-xs text-slate-500 uppercase font-semibold">Actual Opex Incurred</span>
                    <div className="mt-1 text-2xl font-bold font-mono text-slate-900">
                      {reportData.currency} {reportData.opexMetric.actualValue.toLocaleString()}
                    </div>
                    <Badge variant={reportData.opexMetric.favorability === 'FAVORABLE' ? 'success' : 'danger'}>
                      {reportData.opexMetric.favorability} ({reportData.opexMetric.variancePercent}%)
                    </Badge>
                  </div>
                </div>
              </div>
            )}

            {/* Executive Variance Summary View */}
            {activeTab === 'summary' && (
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  {/* Top Favorable */}
                  <div className="space-y-3">
                    <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider block">
                      Top Favorable Variances
                    </span>
                    {(reportData.topFavorable || []).map((f: any) => (
                      <div key={f.metricCode} className="p-3 bg-emerald-50/60 rounded border border-emerald-200 text-xs flex justify-between items-center">
                        <div>
                          <div className="font-semibold text-emerald-950">{f.metricName}</div>
                          <div className="text-emerald-700 font-mono text-[11px]">{f.metricCode}</div>
                        </div>
                        <div className="text-right font-mono font-bold text-emerald-800">
                          +{reportData.currency} {f.varianceAmount.toLocaleString()} ({f.variancePercent}%)
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Top Unfavorable */}
                  <div className="space-y-3">
                    <span className="text-xs font-semibold text-rose-800 uppercase tracking-wider block">
                      Top Unfavorable Variances (Cost Pressures)
                    </span>
                    {(reportData.topUnfavorable || []).map((u: any) => (
                      <div key={u.metricCode} className="p-3 bg-rose-50/60 rounded border border-rose-200 text-xs flex justify-between items-center">
                        <div>
                          <div className="font-semibold text-rose-950">{u.metricName}</div>
                          <div className="text-rose-700 font-mono text-[11px]">{u.metricCode}</div>
                        </div>
                        <div className="text-right font-mono font-bold text-rose-800">
                          +{reportData.currency} {u.varianceAmount.toLocaleString()} ({u.variancePercent}%)
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Open Commentary Actions */}
                <div className="space-y-3 pt-3 border-t border-slate-200">
                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">
                    Open Action Items & Explanations ({reportData.openCommentaryItems?.length || 0})
                  </span>
                  {(reportData.openCommentaryItems || []).length === 0 ? (
                    <div className="text-xs text-slate-400">All variances have been accepted or resolved.</div>
                  ) : (
                    (reportData.openCommentaryItems || []).map((c: any) => (
                      <div key={c.id} className="p-3 bg-slate-50 rounded border border-slate-200 text-xs flex justify-between items-center">
                        <div>
                          <div className="font-semibold text-slate-800">{c.metricCode}: {c.comment}</div>
                          <div className="text-[11px] text-slate-500">Root Cause: {c.rootCauseCategory} • By: {c.createdByUser?.name}</div>
                        </div>
                        <Badge variant="warning">{c.status}</Badge>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
