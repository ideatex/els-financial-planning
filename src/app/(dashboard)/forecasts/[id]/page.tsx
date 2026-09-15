'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';

interface ForecastDetail {
  id: string;
  versionCode: string;
  versionName: string;
  description: string | null;
  status: string;
  forecastType: string | null;
  forecastMethod: string | null;
  isPublished: boolean;
  isLocked: boolean;
  planningCycle: { id: string; name: string };
  actualsCutoffPeriod: { id: string; periodName: string; periodNumber: number } | null;
  forecastHorizonStart: { id: string; periodName: string; periodNumber: number } | null;
  forecastHorizonEnd: { id: string; periodName: string; periodNumber: number } | null;
  forecastPeriodSources: Array<{
    id: string;
    periodNumber: number;
    sourceType: string;
    actualsAvailable: boolean;
    forecastAvailable: boolean;
    actualRevenue: number | null;
    actualCogs: number | null;
    actualOpex: number | null;
    forecastRevenue: number | null;
    forecastCogs: number | null;
    forecastOpex: number | null;
    fiscalPeriod: { id: string; periodName: string };
  }>;
  governanceLogs: Array<{
    id: string;
    action: string;
    fromStatus: string;
    toStatus: string;
    notes: string | null;
    performedAt: string;
    performedByUser: { id: string; name: string };
  }>;
}

interface PeriodSummary {
  periodId: string;
  periodNumber: number;
  periodName: string;
  sourceType: 'ACTUAL' | 'FORECAST' | 'PLAN' | 'MANUAL_OVERRIDE' | 'UNAVAILABLE';
  actualsAvailable: boolean;
  forecastAvailable: boolean;
  revenue: number;
  cogs: number;
  grossProfit: number;
  opex: number;
  operatingProfit: number;
  salesUnits: number;
  productionUnits: number;
}

interface ForecastSummary {
  periods: PeriodSummary[];
  totals: {
    revenue: number;
    cogs: number;
    grossProfit: number;
    grossMarginPercent: number;
    opex: number;
    operatingProfit: number;
    operatingMarginPercent: number;
    salesUnits: number;
    productionUnits: number;
    actualPeriodsCount: number;
    forecastPeriodsCount: number;
  };
}

export default function ForecastDetailPage() {
  const params = useParams();
  const router = useRouter();
  const forecastId = params.id as string;

  const [forecast, setForecast] = useState<ForecastDetail | null>(null);
  const [summary, setSummary] = useState<ForecastSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Governance Modals
  const [governanceModal, setGovernanceModal] = useState<{
    isOpen: boolean;
    action: 'SUBMIT_FOR_REVIEW' | 'APPROVE' | 'REJECT' | 'PUBLISH' | 'LOCK';
    title: string;
    notes: string;
    reason: string;
  }>({
    isOpen: false,
    action: 'SUBMIT_FOR_REVIEW',
    title: '',
    notes: '',
    reason: '',
  });

  // Scenario Creation Modal
  const [isScenarioModalOpen, setIsScenarioModalOpen] = useState(false);
  const [scenarioForm, setScenarioForm] = useState({
    code: '',
    name: '',
    description: '',
    scenarioType: 'BEST_CASE',
  });

  const loadForecast = async () => {
    try {
      setLoading(true);
      const [fRes, sRes] = await Promise.all([
        fetch(`/api/forecasts/${forecastId}`),
        fetch(`/api/forecasts/${forecastId}/periods`),
      ]);

      if (fRes.ok) {
        const fData = await fRes.json();
        setForecast(fData);
      }
      if (sRes.ok) {
        const sData = await sRes.json();
        setSummary(sData);
      }
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: 'Failed to load forecast details.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (forecastId) loadForecast();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forecastId]);

  const handleCalculate = async () => {
    try {
      setCalculating(true);
      const res = await fetch(`/api/forecasts/${forecastId}/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Calculation failed.');
      }
      setFeedback({ type: 'success', message: 'Forecast successfully calculated.' });
      loadForecast();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setCalculating(false);
    }
  };

  const handleGovernanceAction = async () => {
    try {
      const body: any = {
        action: governanceModal.action,
        notes: governanceModal.notes,
      };
      if (governanceModal.action === 'REJECT') {
        body.reason = governanceModal.reason;
      }

      const res = await fetch(`/api/forecasts/${forecastId}/governance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Governance transition failed.');
      }

      setFeedback({ type: 'success', message: `Forecast status updated to ${governanceModal.action}.` });
      setGovernanceModal((prev) => ({ ...prev, isOpen: false }));
      loadForecast();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    }
  };

  const handleCreateScenario = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/forecasts/${forecastId}/scenarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scenarioForm),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Failed to create scenario.');
      }
      setIsScenarioModalOpen(false);
      setFeedback({ type: 'success', message: `Scenario ${scenarioForm.code} created successfully.` });
      router.push('/scenarios');
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    }
  };

  if (loading || !forecast) {
    return <div className="p-8 text-center text-slate-500">Loading forecast...</div>;
  }

  const cutoffNum = forecast.actualsCutoffPeriod?.periodNumber ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${forecast.versionCode} — ${forecast.versionName}`}
        description={`Planning Cycle: ${forecast.planningCycle?.name} • Method: ${forecast.forecastMethod?.replace(/_/g, ' ')} • Cutoff: ${forecast.actualsCutoffPeriod?.periodName || 'None'}`}
        actions={
          <div className="flex gap-2 flex-wrap items-center">
            <Link href="/forecasts">
              <Button variant="outline">Back to Forecasts</Button>
            </Link>

            <Button
              variant="outline"
              onClick={() => {
                setScenarioForm({
                  code: `${forecast.versionCode}-SCEN`,
                  name: `${forecast.versionName} Scenario`,
                  description: '',
                  scenarioType: 'BEST_CASE',
                });
                setIsScenarioModalOpen(true);
              }}
            >
              + Create What-If Scenario
            </Button>

            {!forecast.isLocked && (
              <Button
                variant="secondary"
                onClick={handleCalculate}
                disabled={calculating}
              >
                {calculating ? 'Calculating...' : 'Recalculate'}
              </Button>
            )}

            {/* Governance Actions */}
            {forecast.status === 'DRAFT' && (
              <Button
                onClick={() =>
                  setGovernanceModal({
                    isOpen: true,
                    action: 'SUBMIT_FOR_REVIEW',
                    title: 'Submit Forecast for Review',
                    notes: '',
                    reason: '',
                  })
                }
              >
                Submit for Review
              </Button>
            )}

            {forecast.status === 'IN_REVIEW' && (
              <>
                <Button
                  variant="outline"
                  onClick={() =>
                    setGovernanceModal({
                      isOpen: true,
                      action: 'REJECT',
                      title: 'Reject Forecast',
                      notes: '',
                      reason: '',
                    })
                  }
                >
                  Reject
                </Button>
                <Button
                  onClick={() =>
                    setGovernanceModal({
                      isOpen: true,
                      action: 'APPROVE',
                      title: 'Approve Forecast',
                      notes: '',
                      reason: '',
                    })
                  }
                >
                  Approve
                </Button>
              </>
            )}

            {forecast.status === 'APPROVED' && (
              <Button
                onClick={() =>
                  setGovernanceModal({
                    isOpen: true,
                    action: 'PUBLISH',
                    title: 'Publish Forecast',
                    notes: '',
                    reason: '',
                  })
                }
              >
                Publish Forecast
              </Button>
            )}

            {(forecast.status === 'PUBLISHED' || forecast.status === 'APPROVED') && !forecast.isLocked && (
              <Button
                variant="outline"
                onClick={() =>
                  setGovernanceModal({
                    isOpen: true,
                    action: 'LOCK',
                    title: 'Lock Forecast (Freeze Baseline)',
                    notes: '',
                    reason: '',
                  })
                }
              >
                Lock Forecast
              </Button>
            )}
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

      {/* Top Status & KPI Summary */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="p-4 bg-white border border-slate-200">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Status</div>
          <div className="mt-2 flex items-center gap-2">
            <Badge
              variant={
                forecast.status === 'APPROVED' || forecast.isPublished
                  ? 'success'
                  : forecast.status === 'IN_REVIEW'
                  ? 'warning'
                  : forecast.status === 'LOCKED'
                  ? 'neutral'
                  : 'primary'
              }
            >
              {forecast.status}
            </Badge>
            {forecast.isLocked && <Badge variant="neutral">LOCKED</Badge>}
            {forecast.isPublished && <Badge variant="success">PUBLISHED</Badge>}
          </div>
          <div className="text-xs text-slate-500 mt-2">
            {forecast.forecastType?.replace(/_/g, ' ')}
          </div>
        </Card>

        <Card className="p-4 bg-white border border-slate-200">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Projected Revenue</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            ₹{summary?.totals.revenue.toLocaleString('en-IN') ?? 0}
          </div>
          <div className="text-xs text-slate-500 mt-1">Actuals + Future Periods</div>
        </Card>

        <Card className="p-4 bg-white border border-slate-200">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Projected COGS</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            ₹{summary?.totals.cogs.toLocaleString('en-IN') ?? 0}
          </div>
          <div className="text-xs text-slate-500 mt-1">Direct & Mfg Overhead</div>
        </Card>

        <Card className="p-4 bg-white border border-slate-200">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Gross Profit</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">
            ₹{summary?.totals.grossProfit.toLocaleString('en-IN') ?? 0}
          </div>
          <div className="text-xs text-emerald-600 mt-1 font-semibold">
            Margin: {summary?.totals.grossMarginPercent.toFixed(2)}%
          </div>
        </Card>

        <Card className="p-4 bg-white border border-slate-200">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Operating Profit (EBIT)</div>
          <div className="text-2xl font-bold text-blue-700 mt-1">
            ₹{summary?.totals.operatingProfit.toLocaleString('en-IN') ?? 0}
          </div>
          <div className="text-xs text-blue-600 mt-1 font-semibold">
            Margin: {summary?.totals.operatingMarginPercent.toFixed(2)}%
          </div>
        </Card>
      </div>

      {/* Visual Period Progression Timeline */}
      <Card className="p-5 bg-white border border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Period Timeline & Source Classification</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Cutoff Period: <strong className="text-slate-800">{forecast.actualsCutoffPeriod?.periodName}</strong> (Period #{cutoffNum}) • Blue = Closed Actuals, Green = Forecast Projections
            </p>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 text-blue-700 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span> Actuals ({summary?.totals.actualPeriodsCount ?? 0}P)
            </span>
            <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium ml-3">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span> Forecast Projections ({summary?.totals.forecastPeriodsCount ?? 0}P)
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 lg:grid-cols-12 gap-2">
          {summary?.periods.map((p) => {
            const isActual = p.periodNumber <= cutoffNum;
            return (
              <div
                key={p.periodId}
                className={`p-2.5 rounded border text-center transition-all ${
                  isActual
                    ? 'bg-blue-50/60 border-blue-200 text-blue-900'
                    : 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                }`}
              >
                <div className="text-[11px] font-bold truncate">{p.periodName}</div>
                <div className="mt-1">
                  <span
                    className={`inline-block text-[10px] font-semibold px-1.5 py-0.2 rounded uppercase ${
                      isActual ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {isActual ? 'ACTUAL' : 'FORECAST'}
                  </span>
                </div>
                <div className="text-[11px] font-semibold mt-2">
                  ₹{Math.round(p.revenue / 1000)}k
                </div>
                <div className="text-[10px] text-slate-500">
                  EBIT: ₹{Math.round(p.operatingProfit / 1000)}k
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Financial Statement Grid */}
      <Card className="bg-white border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Multi-Period Financial Statement Grid</h3>
          <span className="text-xs text-slate-500 font-mono">Currency: INR (₹)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
              <tr>
                <th className="py-2.5 px-3 min-w-[200px]">Financial Metric</th>
                {summary?.periods.map((p) => (
                  <th
                    key={p.periodId}
                    className={`py-2.5 px-3 text-right ${
                      p.periodNumber <= cutoffNum ? 'bg-blue-50/50 text-blue-950 font-bold' : ''
                    }`}
                  >
                    {p.periodName}
                  </th>
                ))}
                <th className="py-2.5 px-3 text-right bg-slate-100 font-bold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {/* Gross Revenue */}
              <tr className="hover:bg-slate-50 font-semibold text-slate-900">
                <td className="py-2.5 px-3 font-sans">Gross Revenue</td>
                {summary?.periods.map((p) => (
                  <td key={p.periodId} className="py-2.5 px-3 text-right">
                    ₹{p.revenue.toLocaleString('en-IN')}
                  </td>
                ))}
                <td className="py-2.5 px-3 text-right bg-slate-50 font-bold">
                  ₹{summary?.totals.revenue.toLocaleString('en-IN')}
                </td>
              </tr>

              {/* COGS */}
              <tr className="hover:bg-slate-50 text-slate-700">
                <td className="py-2.5 px-3 font-sans">Cost of Goods Sold (COGS)</td>
                {summary?.periods.map((p) => (
                  <td key={p.periodId} className="py-2.5 px-3 text-right">
                    ₹{p.cogs.toLocaleString('en-IN')}
                  </td>
                ))}
                <td className="py-2.5 px-3 text-right bg-slate-50 font-bold">
                  ₹{summary?.totals.cogs.toLocaleString('en-IN')}
                </td>
              </tr>

              {/* Gross Profit */}
              <tr className="hover:bg-emerald-50/40 bg-emerald-50/20 font-semibold text-emerald-900">
                <td className="py-2.5 px-3 font-sans">Gross Profit</td>
                {summary?.periods.map((p) => (
                  <td key={p.periodId} className="py-2.5 px-3 text-right">
                    ₹{p.grossProfit.toLocaleString('en-IN')}
                  </td>
                ))}
                <td className="py-2.5 px-3 text-right bg-emerald-100/40 font-bold text-emerald-950">
                  ₹{summary?.totals.grossProfit.toLocaleString('en-IN')}
                </td>
              </tr>

              {/* Gross Margin % */}
              <tr className="hover:bg-slate-50 text-slate-600 text-[11px]">
                <td className="py-2 px-3 font-sans pl-6">Gross Margin %</td>
                {summary?.periods.map((p) => {
                  const gm = p.revenue > 0 ? (p.grossProfit / p.revenue) * 100 : 0;
                  return (
                    <td key={p.periodId} className="py-2 px-3 text-right">
                      {gm.toFixed(1)}%
                    </td>
                  );
                })}
                <td className="py-2 px-3 text-right bg-slate-50 font-bold">
                  {summary?.totals.grossMarginPercent.toFixed(1)}%
                </td>
              </tr>

              {/* Opex */}
              <tr className="hover:bg-slate-50 text-slate-700">
                <td className="py-2.5 px-3 font-sans">Operating Expenses (Opex)</td>
                {summary?.periods.map((p) => (
                  <td key={p.periodId} className="py-2.5 px-3 text-right">
                    ₹{p.opex.toLocaleString('en-IN')}
                  </td>
                ))}
                <td className="py-2.5 px-3 text-right bg-slate-50 font-bold">
                  ₹{summary?.totals.opex.toLocaleString('en-IN')}
                </td>
              </tr>

              {/* Operating Profit */}
              <tr className="hover:bg-blue-50/40 bg-blue-50/20 font-bold text-blue-900 border-t border-b border-blue-200">
                <td className="py-2.5 px-3 font-sans">Operating Profit (EBIT)</td>
                {summary?.periods.map((p) => (
                  <td key={p.periodId} className="py-2.5 px-3 text-right">
                    ₹{p.operatingProfit.toLocaleString('en-IN')}
                  </td>
                ))}
                <td className="py-2.5 px-3 text-right bg-blue-100/40 font-bold text-blue-950">
                  ₹{summary?.totals.operatingProfit.toLocaleString('en-IN')}
                </td>
              </tr>

              {/* Operating Margin % */}
              <tr className="hover:bg-slate-50 text-slate-600 text-[11px]">
                <td className="py-2 px-3 font-sans pl-6">Operating Margin %</td>
                {summary?.periods.map((p) => {
                  const om = p.revenue > 0 ? (p.operatingProfit / p.revenue) * 100 : 0;
                  return (
                    <td key={p.periodId} className="py-2 px-3 text-right">
                      {om.toFixed(1)}%
                    </td>
                  );
                })}
                <td className="py-2 px-3 text-right bg-slate-50 font-bold">
                  {summary?.totals.operatingMarginPercent.toFixed(1)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Governance Audit Log History */}
      <Card className="p-5 bg-white border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Governance History & Audit Lineage</h3>
        {forecast.governanceLogs.length === 0 ? (
          <div className="text-xs text-slate-500 py-3">No governance transitions logged yet.</div>
        ) : (
          <div className="space-y-3">
            {forecast.governanceLogs.map((log) => (
              <div key={log.id} className="flex items-start justify-between text-xs py-2 border-b border-slate-100">
                <div>
                  <span className="font-semibold text-slate-900">{log.action.replace(/_/g, ' ')}</span>
                  <span className="text-slate-500 mx-2">•</span>
                  <span className="text-slate-600">
                    Status: <code className="bg-slate-100 px-1 py-0.5 rounded">{log.fromStatus}</code> &rarr;{' '}
                    <code className="bg-slate-100 px-1 py-0.5 rounded font-semibold">{log.toStatus}</code>
                  </span>
                  {log.notes && <p className="text-slate-500 mt-1 italic">&ldquo;{log.notes}&rdquo;</p>}
                </div>
                <div className="text-right text-slate-400">
                  <div>{log.performedByUser?.name || 'System'}</div>
                  <div>{new Date(log.performedAt).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Governance Transition Modal */}
      <Modal
        isOpen={governanceModal.isOpen}
        onClose={() => setGovernanceModal((prev) => ({ ...prev, isOpen: false }))}
        title={governanceModal.title}
      >
        <div className="space-y-4">
          {governanceModal.action === 'REJECT' && (
            <Input
              label="Rejection Reason *"
              value={governanceModal.reason}
              onChange={(e) => setGovernanceModal((prev) => ({ ...prev, reason: e.target.value }))}
              placeholder="State why this forecast cannot be approved..."
              required
            />
          )}

          <Input
            label="Governance Notes / Rationale"
            value={governanceModal.notes}
            onChange={(e) => setGovernanceModal((prev) => ({ ...prev, notes: e.target.value }))}
            placeholder="Executive review comments or audit documentation..."
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <Button
              variant="outline"
              onClick={() => setGovernanceModal((prev) => ({ ...prev, isOpen: false }))}
            >
              Cancel
            </Button>
            <Button onClick={handleGovernanceAction}>Confirm</Button>
          </div>
        </div>
      </Modal>

      {/* Create Scenario Modal */}
      <Modal
        isOpen={isScenarioModalOpen}
        onClose={() => setIsScenarioModalOpen(false)}
        title="Create What-If Scenario Version"
      >
        <form onSubmit={handleCreateScenario} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Scenario Code *"
              value={scenarioForm.code}
              onChange={(e) => setScenarioForm({ ...scenarioForm, code: e.target.value.toUpperCase() })}
              required
            />
            <Input
              label="Scenario Name *"
              value={scenarioForm.name}
              onChange={(e) => setScenarioForm({ ...scenarioForm, name: e.target.value })}
              required
            />
          </div>

          <Select
            label="Scenario Type *"
            value={scenarioForm.scenarioType}
            onChange={(e) => setScenarioForm({ ...scenarioForm, scenarioType: e.target.value })}
            options={[
              { value: 'BEST_CASE', label: 'Best Case (Optimistic)' },
              { value: 'WORST_CASE', label: 'Worst Case (Pessimistic)' },
              { value: 'UPSIDE_CASE', label: 'Upside Case' },
              { value: 'DOWNSIDE_CASE', label: 'Downside Case' },
              { value: 'CUSTOM', label: 'Custom Scenario' },
            ]}
            required
          />

          <Input
            label="Scenario Rationale / Description"
            value={scenarioForm.description}
            onChange={(e) => setScenarioForm({ ...scenarioForm, description: e.target.value })}
            placeholder="Key drivers and hypothesis being tested..."
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <Button variant="outline" type="button" onClick={() => setIsScenarioModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Create Scenario</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
