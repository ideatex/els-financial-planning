'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/Alert';

interface ForecastOption {
  id: string;
  versionCode: string;
  versionName: string;
  planningCycle: { id: string; name: string };
}

interface ScenarioItem {
  id: string;
  versionCode: string;
  versionName: string;
  scenarioType: string | null;
  status: string;
  isLocked: boolean;
}

interface WhatIfDelta {
  id: string;
  targetCode: string;
  targetName: string;
  deltaType: string;
  deltaValue: number;
  baselineValue: number;
  proposedValue: number;
  rationale: string | null;
}

interface ComparisonResult {
  baseForecast: {
    id: string;
    code: string;
    name: string;
    totals: {
      revenue: number;
      cogs: number;
      grossProfit: number;
      grossMarginPercent: number;
      opex: number;
      operatingProfit: number;
      operatingMarginPercent: number;
    };
  };
  scenarios: Array<{
    scenarioId: string;
    scenarioCode: string;
    scenarioName: string;
    scenarioType: string;
    status: string;
    totals: {
      revenue: number;
      cogs: number;
      grossProfit: number;
      grossMarginPercent: number;
      opex: number;
      operatingProfit: number;
      operatingMarginPercent: number;
    };
    metrics: Record<
      string,
      {
        metricKey: string;
        metricLabel: string;
        baseValue: number;
        scenarioValue: number;
        absoluteVariance: number;
        percentVariance: number;
        favorability: 'FAVORABLE' | 'UNFAVORABLE' | 'NEUTRAL';
      }
    >;
    deltas: Array<{
      targetCode: string;
      targetName: string;
      deltaType: string;
      deltaValue: number;
      baselineValue: number;
      proposedValue: number;
    }>;
  }>;
}

export default function ScenarioPlanningPage() {
  const [baseForecasts, setBaseForecasts] = useState<ForecastOption[]>([]);
  const [selectedBaseId, setSelectedBaseId] = useState<string>('');
  const [scenarios, setScenarios] = useState<ScenarioItem[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('');
  const [deltas, setDeltas] = useState<WhatIfDelta[]>([]);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);

  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // New Delta Form
  const [deltaForm, setDeltaForm] = useState({
    targetCode: 'SALES_VOLUME',
    deltaType: 'PERCENTAGE' as 'PERCENTAGE' | 'ABSOLUTE' | 'REPLACEMENT',
    deltaValue: 10,
    rationale: '',
  });

  // Create Scenario Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newScenarioForm, setNewScenarioForm] = useState({
    code: '',
    name: '',
    description: '',
    scenarioType: 'BEST_CASE' as 'BASE_CASE' | 'BEST_CASE' | 'WORST_CASE' | 'DOWNSIDE_CASE' | 'UPSIDE_CASE' | 'CUSTOM',
  });

  // Load Base Forecasts
  useEffect(() => {
    const fetchForecasts = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/forecasts');
        if (res.ok) {
          const data = await res.json();
          // Filter to base forecasts (not scenarios)
          const bases = data.filter((f: any) => f.forecastType !== 'SCENARIO_FORECAST');
          setBaseForecasts(bases);
          if (bases.length > 0) {
            setSelectedBaseId(bases[0].id);
          }
        }
      } catch {
        setFeedback({ type: 'error', message: 'Failed to fetch base forecasts.' });
      } finally {
        setLoading(false);
      }
    };
    fetchForecasts();
  }, []);

  // When selected base forecast changes, fetch derived scenarios and comparison
  useEffect(() => {
    if (!selectedBaseId) return;

    const fetchScenarios = async () => {
      try {
        const res = await fetch(`/api/forecasts/${selectedBaseId}/scenarios`);
        if (res.ok) {
          const scList = await res.json();
          setScenarios(scList);
          if (scList.length > 0) {
            setSelectedScenarioId(scList[0].id);
          } else {
            setSelectedScenarioId('');
            setDeltas([]);
            setComparison(null);
          }
        }
      } catch {
        // quiet fallback
      }
    };
    fetchScenarios();
  }, [selectedBaseId]);

  // When selected scenario changes, fetch its deltas
  useEffect(() => {
    if (!selectedScenarioId) return;

    const fetchDeltas = async () => {
      try {
        const res = await fetch(`/api/forecasts/scenarios/${selectedScenarioId}/what-if`);
        if (res.ok) {
          const dData = await res.json();
          setDeltas(dData);
        }
      } catch {
        // quiet
      }
    };
    fetchDeltas();
  }, [selectedScenarioId]);

  // Load Multi-Scenario Comparison
  const loadComparison = async () => {
    if (!selectedBaseId || scenarios.length === 0) return;
    try {
      const scenarioIds = scenarios.map((s) => s.id).join(',');
      const res = await fetch(
        `/api/forecasts/scenarios/compare?baseForecastVersionId=${selectedBaseId}&scenarioVersionIds=${scenarioIds}`
      );
      if (res.ok) {
        const compData = await res.json();
        setComparison(compData);
      }
    } catch {
      // quiet
    }
  };

  useEffect(() => {
    if (selectedBaseId && scenarios.length > 0) {
      loadComparison();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBaseId, scenarios]);

  const handleCreateScenario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBaseId) return;

    try {
      const res = await fetch(`/api/forecasts/${selectedBaseId}/scenarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newScenarioForm),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Failed to create scenario.');
      }

      const created = await res.json();
      setFeedback({ type: 'success', message: `Scenario ${created.versionCode} created.` });
      setIsCreateModalOpen(false);

      // Refresh scenarios
      const scRes = await fetch(`/api/forecasts/${selectedBaseId}/scenarios`);
      if (scRes.ok) {
        const scList = await scRes.json();
        setScenarios(scList);
        setSelectedScenarioId(created.id);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    }
  };

  const handleApplyDelta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedScenarioId) return;

    try {
      const res = await fetch(`/api/forecasts/scenarios/${selectedScenarioId}/what-if`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deltaForm),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Failed to apply what-if delta.');
      }

      setFeedback({ type: 'success', message: `Driver delta applied for ${deltaForm.targetCode}.` });

      // Refresh deltas & recalculate scenario
      const dRes = await fetch(`/api/forecasts/scenarios/${selectedScenarioId}/what-if`);
      if (dRes.ok) {
        const dData = await dRes.json();
        setDeltas(dData);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    }
  };

  const handleRemoveDelta = async (deltaId: string) => {
    if (!selectedScenarioId) return;
    try {
      const res = await fetch(`/api/forecasts/scenarios/${selectedScenarioId}/what-if?deltaId=${deltaId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to remove delta.');

      setFeedback({ type: 'info', message: 'What-if delta removed. Baseline values restored.' });
      setDeltas((prev) => prev.filter((d) => d.id !== deltaId));
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    }
  };

  const handleCalculateScenario = async (scenarioId: string) => {
    try {
      setCalculating(true);
      const res = await fetch(`/api/forecasts/scenarios/${scenarioId}/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Scenario calculation failed.');
      }

      setFeedback({ type: 'success', message: 'Scenario calculation completed.' });
      loadComparison();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setCalculating(false);
    }
  };

  const selectedScenario = scenarios.find((s) => s.id === selectedScenarioId);

  const getFavorabilityBadge = (favorability: 'FAVORABLE' | 'UNFAVORABLE' | 'NEUTRAL') => {
    switch (favorability) {
      case 'FAVORABLE':
        return <Badge variant="success">FAVORABLE</Badge>;
      case 'UNFAVORABLE':
        return <Badge variant="error">UNFAVORABLE</Badge>;
      default:
        return <Badge variant="neutral">NEUTRAL</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="What-If Scenarios"
        description="Create and compare what-if scenario versions against baseline forecasts."
        actions={
          <div className="flex gap-2">
            <Link href="/forecasts">
              <Button variant="outline">Back to Forecasts</Button>
            </Link>
            <Button
              onClick={() => {
                setNewScenarioForm({
                  code: '',
                  name: '',
                  description: '',
                  scenarioType: 'BEST_CASE',
                });
                setIsCreateModalOpen(true);
              }}
              disabled={!selectedBaseId}
            >
              + New Scenario
            </Button>
          </div>
        }
      />

      {feedback && (
        <Alert
          variant={feedback.type}
          message={feedback.message}
          onClose={() => setFeedback(null)}
        />
      )}

      {/* Select Base Forecast */}
      <Card className="p-4 bg-white border border-slate-200">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <div className="md:col-span-2">
            <Select
              label="Select Baseline Forecast Version"
              value={selectedBaseId}
              onChange={(e) => setSelectedBaseId(e.target.value)}
              options={baseForecasts.map((b) => ({
                value: b.id,
                label: `${b.versionCode} — ${b.versionName} (${b.planningCycle?.name})`,
              }))}
            />
          </div>
          <div className="text-right flex justify-end gap-2 pt-5">
            <span className="text-xs text-slate-500 self-center">
              Scenarios Active: <strong>{scenarios.length}</strong>
            </span>
          </div>
        </div>
      </Card>

      {/* Scenario Management & What-If Delta Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Scenarios List & Selected Scenario Deltas */}
        <div className="lg:col-span-6 space-y-6">
          <Card className="p-5 bg-white border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-900">What-If Driver Adjustment Panel</h3>
              {selectedScenarioId && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleCalculateScenario(selectedScenarioId)}
                  disabled={calculating}
                >
                  {calculating ? 'Calculating...' : 'Run Scenario Calc'}
                </Button>
              )}
            </div>

            {scenarios.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs">
                No scenarios created yet for this baseline. Click <strong>+ New Scenario</strong> above to create Best Case, Worst Case, or Custom scenarios.
              </div>
            ) : (
              <div className="space-y-4">
                <Select
                  label="Active Scenario Version"
                  value={selectedScenarioId}
                  onChange={(e) => setSelectedScenarioId(e.target.value)}
                  options={scenarios.map((s) => ({
                    value: s.id,
                    label: `${s.versionCode} (${s.scenarioType?.replace(/_/g, ' ')}) — ${s.status}`,
                  }))}
                />

                {/* What-If Driver Form */}
                <form onSubmit={handleApplyDelta} className="p-3.5 bg-slate-50 border border-slate-200 rounded space-y-3">
                  <div className="text-xs font-semibold text-slate-800">Apply Operational Driver Delta:</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      label="Driver Target"
                      value={deltaForm.targetCode}
                      onChange={(e) => setDeltaForm({ ...deltaForm, targetCode: e.target.value })}
                      options={[
                        { value: 'SALES_VOLUME', label: 'Sales Volume (Demand)' },
                        { value: 'SELLING_PRICE', label: 'Selling Price per Unit' },
                        { value: 'RAW_MATERIAL_COST', label: 'Raw Material Unit Price' },
                        { value: 'LABOR_RATE', label: 'Standard Labor Rate' },
                        { value: 'MONTHLY_OPEX', label: 'Monthly Operating Expense' },
                        { value: 'SCRAP_PERCENTAGE', label: 'Scrap / Loss Percentage' },
                      ]}
                    />
                    <Select
                      label="Adjustment Type"
                      value={deltaForm.deltaType}
                      onChange={(e) => setDeltaForm({ ...deltaForm, deltaType: e.target.value as any })}
                      options={[
                        { value: 'PERCENTAGE', label: 'Percentage Change (%)' },
                        { value: 'ABSOLUTE', label: 'Absolute Amount (+/-)' },
                        { value: 'REPLACEMENT', label: 'Direct Replacement' },
                      ]}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      label={deltaForm.deltaType === 'PERCENTAGE' ? 'Delta Percentage (e.g. +10, -3)' : 'Delta Amount'}
                      type="number"
                      step="any"
                      value={deltaForm.deltaValue.toString()}
                      onChange={(e) => setDeltaForm({ ...deltaForm, deltaValue: parseFloat(e.target.value) || 0 })}
                      required
                    />
                    <Input
                      label="Sensitivity Rationale"
                      value={deltaForm.rationale}
                      onChange={(e) => setDeltaForm({ ...deltaForm, rationale: e.target.value })}
                      placeholder="e.g. Supplier steel price hike"
                    />
                  </div>

                  <Button type="submit" size="sm" className="w-full">
                    Apply Delta to Scenario
                  </Button>
                </form>

                {/* Active Deltas List */}
                <div>
                  <div className="text-xs font-semibold text-slate-700 mb-2">Configured Driver Deltas ({deltas.length}):</div>
                  {deltas.length === 0 ? (
                    <div className="text-xs text-slate-400 italic">No deltas applied. Baseline values currently in effect.</div>
                  ) : (
                    <div className="space-y-2">
                      {deltas.map((d) => (
                        <div key={d.id} className="p-2.5 bg-white border border-slate-200 rounded flex items-center justify-between text-xs">
                          <div>
                            <span className="font-semibold text-slate-900">{d.targetName}</span>
                            <span className="mx-2 text-slate-400">•</span>
                            <span className="font-mono text-blue-700 font-bold">
                              {d.deltaType === 'PERCENTAGE' ? `${d.deltaValue > 0 ? '+' : ''}${d.deltaValue}%` : d.deltaValue}
                            </span>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              Baseline: ₹{d.baselineValue.toFixed(2)} &rarr; Proposed: ₹{d.proposedValue.toFixed(2)}
                              {d.rationale && <span className="italic ml-2">({d.rationale})</span>}
                            </div>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => handleRemoveDelta(d.id)}>
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Scenario Status & Actions */}
        <div className="lg:col-span-6 space-y-6">
          <Card className="p-5 bg-white border border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Scenario Status</h3>
            {selectedScenario ? (
              <div className="space-y-4 text-xs text-slate-600">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-slate-400 block mb-0.5">Scenario Code</span>
                    <span className="font-semibold text-slate-900">{selectedScenario.versionCode}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">Scenario Type</span>
                    <span className="font-semibold text-slate-900">{selectedScenario.scenarioType?.replace(/_/g, ' ')}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">Status</span>
                    <Badge variant={selectedScenario.status === 'APPROVED' ? 'success' : 'neutral'}>
                      {selectedScenario.status}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">Applied Deltas</span>
                    <span className="font-semibold text-slate-900">{deltas.length} active</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center gap-3">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={calculating || !selectedScenarioId}
                    onClick={() => handleCalculateScenario(selectedScenarioId)}
                  >
                    {calculating ? 'Calculating...' : 'Run Scenario Calculation'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 py-4 text-center">
                Select a scenario to view status and run calculations.
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Side-by-Side Comparison Matrix */}
      {comparison && comparison.scenarios.length > 0 && (
        <Card className="bg-white border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Side-by-Side Scenario Variance Matrix</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Comparing Baseline ({comparison.baseForecast.code}) against all derived sensitivity scenarios.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500">Currency: INR (₹)</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                <tr>
                  <th className="py-3 px-4 min-w-[220px]">Metric / Statement Line</th>
                  <th className="py-3 px-4 text-right bg-slate-100/70 font-bold min-w-[140px]">
                    Baseline ({comparison.baseForecast.code})
                  </th>
                  {comparison.scenarios.map((sc) => (
                    <th key={sc.scenarioId} className="py-3 px-4 text-right min-w-[200px]">
                      <div>{sc.scenarioCode}</div>
                      <div className="text-[10px] font-normal text-slate-500">{sc.scenarioType?.replace(/_/g, ' ')}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {/* Revenue */}
                <tr className="hover:bg-slate-50 font-semibold text-slate-900">
                  <td className="py-2.5 px-4 font-sans">Gross Revenue</td>
                  <td className="py-2.5 px-4 text-right bg-slate-50">
                    ₹{comparison.baseForecast.totals.revenue.toLocaleString('en-IN')}
                  </td>
                  {comparison.scenarios.map((sc) => {
                    const m = sc.metrics.revenue;
                    return (
                      <td key={sc.scenarioId} className="py-2.5 px-4 text-right">
                        <div>₹{sc.totals.revenue.toLocaleString('en-IN')}</div>
                        <div className="text-[10px] font-normal mt-0.5 flex items-center justify-end gap-1">
                          <span className={m.absoluteVariance >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                            {m.absoluteVariance >= 0 ? '+' : ''}₹{m.absoluteVariance.toLocaleString('en-IN')} ({m.percentVariance.toFixed(1)}%)
                          </span>
                          {getFavorabilityBadge(m.favorability)}
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* COGS */}
                <tr className="hover:bg-slate-50 text-slate-700">
                  <td className="py-2.5 px-4 font-sans">Cost of Goods Sold (COGS)</td>
                  <td className="py-2.5 px-4 text-right bg-slate-50">
                    ₹{comparison.baseForecast.totals.cogs.toLocaleString('en-IN')}
                  </td>
                  {comparison.scenarios.map((sc) => {
                    const m = sc.metrics.cogs;
                    return (
                      <td key={sc.scenarioId} className="py-2.5 px-4 text-right">
                        <div>₹{sc.totals.cogs.toLocaleString('en-IN')}</div>
                        <div className="text-[10px] font-normal mt-0.5 flex items-center justify-end gap-1">
                          <span className={m.absoluteVariance <= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                            {m.absoluteVariance >= 0 ? '+' : ''}₹{m.absoluteVariance.toLocaleString('en-IN')} ({m.percentVariance.toFixed(1)}%)
                          </span>
                          {getFavorabilityBadge(m.favorability)}
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* Gross Profit */}
                <tr className="hover:bg-emerald-50/40 bg-emerald-50/20 font-bold text-emerald-950">
                  <td className="py-2.5 px-4 font-sans">Gross Profit</td>
                  <td className="py-2.5 px-4 text-right bg-emerald-100/30">
                    ₹{comparison.baseForecast.totals.grossProfit.toLocaleString('en-IN')}
                  </td>
                  {comparison.scenarios.map((sc) => {
                    const m = sc.metrics.grossProfit;
                    return (
                      <td key={sc.scenarioId} className="py-2.5 px-4 text-right">
                        <div>₹{sc.totals.grossProfit.toLocaleString('en-IN')}</div>
                        <div className="text-[10px] font-normal mt-0.5 flex items-center justify-end gap-1">
                          <span className={m.absoluteVariance >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                            {m.absoluteVariance >= 0 ? '+' : ''}₹{m.absoluteVariance.toLocaleString('en-IN')} ({m.percentVariance.toFixed(1)}%)
                          </span>
                          {getFavorabilityBadge(m.favorability)}
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* Gross Margin % */}
                <tr className="hover:bg-slate-50 text-slate-600 text-[11px]">
                  <td className="py-2 px-4 font-sans pl-6">Gross Margin %</td>
                  <td className="py-2 px-4 text-right bg-slate-50">
                    {comparison.baseForecast.totals.grossMarginPercent.toFixed(2)}%
                  </td>
                  {comparison.scenarios.map((sc) => (
                    <td key={sc.scenarioId} className="py-2 px-4 text-right">
                      {sc.totals.grossMarginPercent.toFixed(2)}%
                      <span className="text-[10px] text-slate-500 ml-1.5">
                        ({(sc.totals.grossMarginPercent - comparison.baseForecast.totals.grossMarginPercent >= 0 ? '+' : '')}
                        {(sc.totals.grossMarginPercent - comparison.baseForecast.totals.grossMarginPercent).toFixed(2)} pts)
                      </span>
                    </td>
                  ))}
                </tr>

                {/* Opex */}
                <tr className="hover:bg-slate-50 text-slate-700">
                  <td className="py-2.5 px-4 font-sans">Operating Expenses (Opex)</td>
                  <td className="py-2.5 px-4 text-right bg-slate-50">
                    ₹{comparison.baseForecast.totals.opex.toLocaleString('en-IN')}
                  </td>
                  {comparison.scenarios.map((sc) => {
                    const m = sc.metrics.opex;
                    return (
                      <td key={sc.scenarioId} className="py-2.5 px-4 text-right">
                        <div>₹{sc.totals.opex.toLocaleString('en-IN')}</div>
                        <div className="text-[10px] font-normal mt-0.5 flex items-center justify-end gap-1">
                          <span className={m.absoluteVariance <= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                            {m.absoluteVariance >= 0 ? '+' : ''}₹{m.absoluteVariance.toLocaleString('en-IN')} ({m.percentVariance.toFixed(1)}%)
                          </span>
                          {getFavorabilityBadge(m.favorability)}
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* Operating Profit (EBIT) */}
                <tr className="hover:bg-blue-50/40 bg-blue-50/20 font-bold text-blue-950 border-t border-b border-blue-200">
                  <td className="py-2.5 px-4 font-sans">Operating Profit (EBIT)</td>
                  <td className="py-2.5 px-4 text-right bg-blue-100/30">
                    ₹{comparison.baseForecast.totals.operatingProfit.toLocaleString('en-IN')}
                  </td>
                  {comparison.scenarios.map((sc) => {
                    const m = sc.metrics.operatingProfit;
                    return (
                      <td key={sc.scenarioId} className="py-2.5 px-4 text-right">
                        <div>₹{sc.totals.operatingProfit.toLocaleString('en-IN')}</div>
                        <div className="text-[10px] font-normal mt-0.5 flex items-center justify-end gap-1">
                          <span className={m.absoluteVariance >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                            {m.absoluteVariance >= 0 ? '+' : ''}₹{m.absoluteVariance.toLocaleString('en-IN')} ({m.percentVariance.toFixed(1)}%)
                          </span>
                          {getFavorabilityBadge(m.favorability)}
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* Operating Margin % */}
                <tr className="hover:bg-slate-50 text-slate-600 text-[11px]">
                  <td className="py-2 px-4 font-sans pl-6">Operating Margin %</td>
                  <td className="py-2 px-4 text-right bg-slate-50">
                    {comparison.baseForecast.totals.operatingMarginPercent.toFixed(2)}%
                  </td>
                  {comparison.scenarios.map((sc) => (
                    <td key={sc.scenarioId} className="py-2 px-4 text-right">
                      {sc.totals.operatingMarginPercent.toFixed(2)}%
                      <span className="text-[10px] text-slate-500 ml-1.5">
                        ({(sc.totals.operatingMarginPercent - comparison.baseForecast.totals.operatingMarginPercent >= 0 ? '+' : '')}
                        {(sc.totals.operatingMarginPercent - comparison.baseForecast.totals.operatingMarginPercent).toFixed(2)} pts)
                      </span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Create Scenario Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create New What-If Scenario Version"
      >
        <form onSubmit={handleCreateScenario} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Scenario Code *"
              value={newScenarioForm.code}
              onChange={(e) => setNewScenarioForm({ ...newScenarioForm, code: e.target.value.toUpperCase() })}
              placeholder="e.g. 2026-BEST-CASE"
              required
            />
            <Input
              label="Scenario Name *"
              value={newScenarioForm.name}
              onChange={(e) => setNewScenarioForm({ ...newScenarioForm, name: e.target.value })}
              placeholder="e.g. FY2026 Optimistic Market Expansion"
              required
            />
          </div>

          <Select
            label="Scenario Case Classification *"
            value={newScenarioForm.scenarioType}
            onChange={(e) => setNewScenarioForm({ ...newScenarioForm, scenarioType: e.target.value as any })}
            options={[
              { value: 'BEST_CASE', label: 'Best Case (Optimistic / +Volume / -Costs)' },
              { value: 'WORST_CASE', label: 'Worst Case (Downside / -Volume / +Costs)' },
              { value: 'UPSIDE_CASE', label: 'Upside Case' },
              { value: 'DOWNSIDE_CASE', label: 'Downside Case' },
              { value: 'CUSTOM', label: 'Custom Scenario' },
            ]}
            required
          />

          <Input
            label="Sensitivity Rationale & Assumptions"
            value={newScenarioForm.description}
            onChange={(e) => setNewScenarioForm({ ...newScenarioForm, description: e.target.value })}
            placeholder="Hypothesis, market triggers, or supply chain factors..."
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <Button variant="outline" type="button" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Create Scenario</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
