'use client';

import React, { useState, useEffect } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';

interface VarianceItem {
  metricCode: string;
  metricName: string;
  category: string;
  unitOfMeasure: string;
  currency: string;
  planValue: number;
  actualValue: number;
  varianceAmount: number;
  variancePercent: number | null;
  isPlanZero: boolean;
  zeroPlanState?: 'NEW_ACTUAL_ACTIVITY' | 'NO_PLAN_BASELINE';
  favorability: 'FAVORABLE' | 'UNFAVORABLE' | 'NEUTRAL';
  commentsCount: number;
  decomposition?: {
    volumeVariance?: number;
    priceVariance?: number;
    usageVariance?: number;
    rateVariance?: number;
    efficiencyVariance?: number;
  };
}

interface VarianceSummary {
  totalRevenueVariance: number;
  revenueVariancePercent: number | null;
  revenueFavorability: 'FAVORABLE' | 'UNFAVORABLE' | 'NEUTRAL';
  totalCogsVariance: number;
  cogsVariancePercent: number | null;
  cogsFavorability: 'FAVORABLE' | 'UNFAVORABLE' | 'NEUTRAL';
  grossProfitVariance: number;
  grossProfitVariancePercent: number | null;
  grossProfitFavorability: 'FAVORABLE' | 'UNFAVORABLE' | 'NEUTRAL';
  totalOpexVariance: number;
  opexVariancePercent: number | null;
  opexFavorability: 'FAVORABLE' | 'UNFAVORABLE' | 'NEUTRAL';
  operatingProfitVariance: number;
  operatingProfitVariancePercent: number | null;
  operatingProfitFavorability: 'FAVORABLE' | 'UNFAVORABLE' | 'NEUTRAL';
}

interface VarianceComment {
  id: string;
  metricCode: string;
  comment: string;
  rootCauseCategory: string;
  actionOwner: string | null;
  dueDate: string | null;
  status: string;
  resolutionNotes: string | null;
  createdAt: string;
  createdByUser: { name: string; email: string };
}

export default function VarianceAnalysisPage() {
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
  const [varianceItems, setVarianceItems] = useState<VarianceItem[]>([]);
  const [summary, setSummary] = useState<VarianceSummary | null>(null);
  const [currency, setCurrency] = useState('INR');

  // Commentary Modal State
  const [activeCommentItem, setActiveCommentItem] = useState<VarianceItem | null>(null);
  const [comments, setComments] = useState<VarianceComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [newRootCause, setNewRootCause] = useState('VOLUME');
  const [newActionOwner, setNewActionOwner] = useState('');
  const [newDueDate, setNewDueDate] = useState('');

  // Drill-down Modal State
  const [activeDrillItem, setActiveDrillItem] = useState<VarianceItem | null>(null);

  useEffect(() => {
    loadMetadata();
  }, []);

  useEffect(() => {
    if (selectedCycleId) {
      loadVersions(selectedCycleId);
    }
  }, [selectedCycleId]);

  useEffect(() => {
    if (selectedVersionId && selectedPeriodId) {
      loadVarianceComparison();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVersionId, selectedPeriodId, selectedPlantId, selectedProductId]);

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
        if (cycleList.length > 0) {
          setSelectedCycleId(cycleList[0].id);
        }
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
          // Prefer approved or locked version if available
          const approved = versionList.find((v: any) => v.status === 'APPROVED' || v.status === 'LOCKED');
          setSelectedVersionId(approved ? approved.id : versionList[0].id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function loadVarianceComparison() {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        planVersionId: selectedVersionId,
        fiscalPeriodId: selectedPeriodId,
      });
      if (selectedPlantId) query.set('plantId', selectedPlantId);
      if (selectedProductId) query.set('productId', selectedProductId);

      const res = await fetch(`/api/variance/compare?${query.toString()}`);
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error?.message || 'Failed to calculate variance comparison');
      }

      const data = await res.json();
      setVarianceItems(data.items);
      setSummary(data.summary);
      setCurrency(data.currency);
    } catch (err: any) {
      setError(err.message);
      setVarianceItems([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleOpenComments(item: VarianceItem) {
    setActiveCommentItem(item);
    setCommentsLoading(true);
    try {
      const query = new URLSearchParams({
        planVersionId: selectedVersionId,
        fiscalPeriodId: selectedPeriodId,
        metricCode: item.metricCode,
      });
      const res = await fetch(`/api/variance/comments?${query.toString()}`);
      if (res.ok) {
        setComments(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCommentsLoading(false);
    }
  }

  async function handleAddComment() {
    if (!activeCommentItem || !newCommentText.trim()) return;
    try {
      const res = await fetch('/api/variance/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planningCycleId: selectedCycleId,
          planVersionId: selectedVersionId,
          fiscalPeriodId: selectedPeriodId,
          plantId: selectedPlantId || undefined,
          productId: selectedProductId || undefined,
          metricCode: activeCommentItem.metricCode,
          varianceAmount: activeCommentItem.varianceAmount,
          variancePercent: activeCommentItem.variancePercent,
          favorability: activeCommentItem.favorability,
          rootCauseCategory: newRootCause,
          comment: newCommentText,
          actionOwner: newActionOwner || undefined,
          dueDate: newDueDate || undefined,
        }),
      });

      if (!res.ok) throw new Error('Failed to save variance comment');
      setNewCommentText('');
      setNewActionOwner('');
      setNewDueDate('');
      handleOpenComments(activeCommentItem);
      loadVarianceComparison();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleResolveComment(commentId: string) {
    const notes = prompt('Enter resolution summary / root-cause mitigation:');
    if (!notes) return;
    try {
      const res = await fetch(`/api/variance/comments/${commentId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolutionNotes: notes }),
      });
      if (!res.ok) throw new Error('Failed to resolve comment');
      if (activeCommentItem) handleOpenComments(activeCommentItem);
    } catch (err: any) {
      alert(err.message);
    }
  }

  function handleExportCsv() {
    if (!selectedVersionId || !selectedPeriodId) return;
    const query = new URLSearchParams({
      planVersionId: selectedVersionId,
      fiscalPeriodId: selectedPeriodId,
      type: 'pnl',
    });
    if (selectedPlantId) query.set('plantId', selectedPlantId);
    if (selectedProductId) query.set('productId', selectedProductId);
    window.open(`/api/reports/export?${query.toString()}`, '_blank');
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plan vs Actual Variance Analysis"
        description="Compare plan outputs against imported actuals by period, plant, and product."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleExportCsv} disabled={!summary}>
              <span className="flex items-center gap-1.5">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export CSV
              </span>
            </Button>
            <Button variant="primary" onClick={loadVarianceComparison}>
              Refresh Comparison
            </Button>
          </div>
        }
      />

      {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

      {/* Dimensional Grain Selector */}
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

      {/* KPI Cards Summary */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Revenue Variance</span>
              <Badge variant={summary.revenueFavorability === 'FAVORABLE' ? 'success' : summary.revenueFavorability === 'UNFAVORABLE' ? 'danger' : 'neutral'}>
                {summary.revenueFavorability}
              </Badge>
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-slate-900 tabular-nums">
              {summary.totalRevenueVariance >= 0 ? '+' : ''}
              {currency} {summary.totalRevenueVariance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <span className="text-xs text-slate-500 mt-1 block">
              {summary.revenueVariancePercent !== null ? `${summary.revenueVariancePercent >= 0 ? '+' : ''}${summary.revenueVariancePercent}% vs Plan` : 'N/A'}
            </span>
          </Card>

          <Card className="p-4">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">COGS Variance</span>
              <Badge variant={summary.cogsFavorability === 'FAVORABLE' ? 'success' : summary.cogsFavorability === 'UNFAVORABLE' ? 'danger' : 'neutral'}>
                {summary.cogsFavorability}
              </Badge>
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-slate-900 tabular-nums">
              {summary.totalCogsVariance >= 0 ? '+' : ''}
              {currency} {summary.totalCogsVariance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <span className="text-xs text-slate-500 mt-1 block">
              {summary.cogsVariancePercent !== null ? `${summary.cogsVariancePercent >= 0 ? '+' : ''}${summary.cogsVariancePercent}% vs Plan` : 'N/A'}
            </span>
          </Card>

          <Card className="p-4">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Gross Profit Variance</span>
              <Badge variant={summary.grossProfitFavorability === 'FAVORABLE' ? 'success' : summary.grossProfitFavorability === 'UNFAVORABLE' ? 'danger' : 'neutral'}>
                {summary.grossProfitFavorability}
              </Badge>
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-slate-900 tabular-nums">
              {summary.grossProfitVariance >= 0 ? '+' : ''}
              {currency} {summary.grossProfitVariance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <span className="text-xs text-slate-500 mt-1 block">
              {summary.grossProfitVariancePercent !== null ? `${summary.grossProfitVariancePercent >= 0 ? '+' : ''}${summary.grossProfitVariancePercent}% vs Plan` : 'N/A'}
            </span>
          </Card>

          <Card className="p-4">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Operating Profit (EBIT)</span>
              <Badge variant={summary.operatingProfitFavorability === 'FAVORABLE' ? 'success' : summary.operatingProfitFavorability === 'UNFAVORABLE' ? 'danger' : 'neutral'}>
                {summary.operatingProfitFavorability}
              </Badge>
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-slate-900 tabular-nums">
              {summary.operatingProfitVariance >= 0 ? '+' : ''}
              {currency} {summary.operatingProfitVariance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <span className="text-xs text-slate-500 mt-1 block">
              {summary.operatingProfitVariancePercent !== null ? `${summary.operatingProfitVariancePercent >= 0 ? '+' : ''}${summary.operatingProfitVariancePercent}% vs Plan` : 'N/A'}
            </span>
          </Card>
        </div>
      )}

      {/* Variance Matrix Table */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-sm font-semibold text-slate-800">Plan vs Actual Variance Statement</h2>
          <span className="text-xs text-slate-500">All amounts in {currency}</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Loading variance comparison...</div>
        ) : varianceItems.length === 0 ? (
          <div className="p-12 text-center">
            <EmptyState
              title="No variance data available"
              description="Ensure an approved plan version exists with a completed calculation run, and that actuals have been imported for this fiscal period."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Financial Line Item</th>
                  <th className="px-4 py-3 text-right">Plan Target</th>
                  <th className="px-4 py-3 text-right">Actual Incurred</th>
                  <th className="px-4 py-3 text-right">Variance (Δ)</th>
                  <th className="px-4 py-3 text-right">% Variance</th>
                  <th className="px-4 py-3 text-center">Favorability</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {varianceItems.map((item) => (
                  <tr key={item.metricCode} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{item.metricName}</div>
                      <div className="text-xs text-slate-400 font-mono">{item.metricCode}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700 tabular-nums">
                      {item.unitOfMeasure === 'EA'
                        ? item.planValue.toLocaleString()
                        : `${currency} ${item.planValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-slate-900 tabular-nums">
                      {item.unitOfMeasure === 'EA'
                        ? item.actualValue.toLocaleString()
                        : `${currency} ${item.actualValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono font-semibold tabular-nums ${
                        item.favorability === 'FAVORABLE'
                          ? 'text-emerald-700'
                          : item.favorability === 'UNFAVORABLE'
                          ? 'text-rose-700'
                          : 'text-slate-600'
                      }`}
                    >
                      {item.varianceAmount >= 0 ? '+' : ''}
                      {item.unitOfMeasure === 'EA'
                        ? item.varianceAmount.toLocaleString()
                        : `${currency} ${item.varianceAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-slate-700">
                      {item.variancePercent !== null ? (
                        `${item.variancePercent >= 0 ? '+' : ''}${item.variancePercent}%`
                      ) : (
                        <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded text-[11px]">
                          {item.zeroPlanState || 'N/A'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        variant={
                          item.favorability === 'FAVORABLE'
                            ? 'success'
                            : item.favorability === 'UNFAVORABLE'
                            ? 'danger'
                            : 'neutral'
                        }
                      >
                        {item.favorability}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                      {item.decomposition && (
                        <Button variant="ghost" size="sm" onClick={() => setActiveDrillItem(item)}>
                          Drill-Down
                        </Button>
                      )}
                      <Button variant="secondary" size="sm" onClick={() => handleOpenComments(item)}>
                        Notes ({item.commentsCount})
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Variance Commentary Modal */}
      {activeCommentItem && (
        <Modal
          isOpen={!!activeCommentItem}
          onClose={() => setActiveCommentItem(null)}
          title={`Variance Commentary: ${activeCommentItem.metricName}`}
        >
          <div className="space-y-4">
            <div className="bg-slate-50 p-3 rounded border border-slate-200 text-xs flex justify-between items-center">
              <div>
                <span className="text-slate-500">Variance: </span>
                <span className="font-mono font-bold text-slate-900">
                  {currency} {activeCommentItem.varianceAmount.toLocaleString()}
                </span>
                {activeCommentItem.variancePercent !== null && ` (${activeCommentItem.variancePercent}%)`}
              </div>
              <Badge variant={activeCommentItem.favorability === 'FAVORABLE' ? 'success' : 'danger'}>
                {activeCommentItem.favorability}
              </Badge>
            </div>

            {/* List Existing Comments */}
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {commentsLoading ? (
                <div className="text-center text-xs text-slate-400 py-4">Loading comments...</div>
              ) : comments.length === 0 ? (
                <div className="text-center text-xs text-slate-400 py-4">No commentary recorded for this variance item.</div>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="p-3 bg-white rounded border border-slate-200 text-xs space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>
                        {c.createdByUser.name} • {c.rootCauseCategory}
                      </span>
                      <Badge variant={c.status === 'RESOLVED' ? 'success' : 'warning'}>{c.status}</Badge>
                    </div>
                    <div className="text-slate-800">{c.comment}</div>
                    {c.actionOwner && (
                      <div className="text-[11px] text-slate-500">
                        Owner: <strong>{c.actionOwner}</strong> {c.dueDate && `(Due: ${c.dueDate.slice(0, 10)})`}
                      </div>
                    )}
                    {c.resolutionNotes && (
                      <div className="text-[11px] text-emerald-700 bg-emerald-50 p-1.5 rounded mt-1">
                        <strong>Resolution:</strong> {c.resolutionNotes}
                      </div>
                    )}
                    {c.status !== 'RESOLVED' && (
                      <div className="pt-1 flex justify-end">
                        <Button variant="ghost" size="sm" onClick={() => handleResolveComment(c.id)}>
                          Resolve Action
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Add New Comment */}
            <div className="pt-3 border-t border-slate-200 space-y-3">
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">Add Variance Explanation</span>
              <div className="grid grid-cols-2 gap-2">
                <Select
                  label="Root Cause"
                  value={newRootCause}
                  onChange={(e) => setNewRootCause(e.target.value)}
                  options={[
                    { value: 'VOLUME', label: 'Volume Variance' },
                    { value: 'PRICE', label: 'Price / Rate Change' },
                    { value: 'PRODUCTION_EFFICIENCY', label: 'Production Efficiency' },
                    { value: 'MATERIAL_COST', label: 'Material Cost Spike' },
                    { value: 'TIMING', label: 'Timing / Cut-off' },
                    { value: 'OTHER', label: 'Other Operational Factor' },
                  ]}
                />
                <Input
                  label="Action Owner (Optional)"
                  placeholder="e.g. Production Manager"
                  value={newActionOwner}
                  onChange={(e) => setNewActionOwner(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Explanatory Notes & Action Plan
                </label>
                <textarea
                  className="w-full h-20 text-xs p-2 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  placeholder="Explain why actuals diverged from planned budget and steps taken..."
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setActiveCommentItem(null)}>
                  Close
                </Button>
                <Button variant="primary" disabled={!newCommentText.trim()} onClick={handleAddComment}>
                  Save Comment
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Drill-down Modal */}
      {activeDrillItem && activeDrillItem.decomposition && (
        <Modal
          isOpen={!!activeDrillItem}
          onClose={() => setActiveDrillItem(null)}
          title={`Variance Decomposition: ${activeDrillItem.metricName}`}
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-slate-50 rounded border border-slate-200">
              <div className="font-semibold text-slate-800">Mathematical Decomposition Formula:</div>
              <div className="text-slate-600 mt-1 font-mono">
                Total Variance = Volume Variance + Price/Rate Variance
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-white rounded border border-slate-200">
                <span className="text-slate-500 block">Volume Variance</span>
                <span className="text-base font-bold font-mono text-slate-900">
                  {currency} {(activeDrillItem.decomposition.volumeVariance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[11px] text-slate-400 block mt-1">(Actual Qty - Plan Qty) × Plan Price</span>
              </div>

              <div className="p-3 bg-white rounded border border-slate-200">
                <span className="text-slate-500 block">Price / Rate Variance</span>
                <span className="text-base font-bold font-mono text-slate-900">
                  {currency} {(activeDrillItem.decomposition.priceVariance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[11px] text-slate-400 block mt-1">Actual Qty × (Actual Price - Plan Price)</span>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-200">
              <Button variant="secondary" onClick={() => setActiveDrillItem(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
