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
import { EmptyState } from '@/components/ui/EmptyState';

interface ForecastVersionItem {
  id: string;
  versionCode: string;
  versionName: string;
  description: string | null;
  forecastType: string | null;
  forecastMethod: string | null;
  status: string;
  isPublished: boolean;
  isLocked: boolean;
  scenarioType: string | null;
  createdAt: string;
  planningCycle: { id: string; name: string };
  actualsCutoffPeriod: { id: string; periodName: string; periodNumber: number } | null;
  forecastHorizonStart: { id: string; periodName: string; periodNumber: number } | null;
  forecastHorizonEnd: { id: string; periodName: string; periodNumber: number } | null;
  owner: { id: string; name: string; email: string } | null;
}

export default function ForecastsListPage() {
  const [forecasts, setForecasts] = useState<ForecastVersionItem[]>([]);
  const [cycles, setCycles] = useState<Array<{ id: string; name: string }>>([]);
  const [periods, setPeriods] = useState<Array<{ id: string; periodName: string; periodNumber: number }>>([]);
  const [planVersions, setPlanVersions] = useState<Array<{ id: string; versionCode: string; versionName: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [calculatingId, setCalculatingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Filters
  const [selectedCycleId, setSelectedCycleId] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');

  // Create Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    planningCycleId: '',
    basePlanVersionId: '',
    forecastType: 'MONTHLY_FORECAST',
    forecastMethod: 'ACTUALS_PLUS_REMAINING_PLAN',
    actualsCutoffPeriodId: '',
    forecastHorizonStartId: '',
    forecastHorizonEndId: '',
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [fRes, cRes] = await Promise.all([
        fetch('/api/forecasts'),
        fetch('/api/planning/cycles'),
      ]);

      if (fRes.ok) {
        const data = await fRes.json();
        setForecasts(Array.isArray(data) ? data : (data.forecasts || []));
      }
      if (cRes.ok) {
        const data = await cRes.json();
        const cycleList = Array.isArray(data) ? data : (data.cycles || []);
        setCycles(cycleList);
        if (cycleList.length > 0 && !formData.planningCycleId) {
          setFormData((prev) => ({ ...prev, planningCycleId: cycleList[0].id }));
        }
      }
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: 'Failed to load forecasts.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When selected cycle changes in form, fetch plan versions & periods
  useEffect(() => {
    if (!formData.planningCycleId) return;
    const fetchCycleDetails = async () => {
      try {
        const [vRes, pRes] = await Promise.all([
          fetch(`/api/planning/cycles/${formData.planningCycleId}/versions`),
          fetch('/api/master-data/fiscal-calendar'),
        ]);
        if (vRes.ok) {
          const vData = await vRes.json();
          const vList = Array.isArray(vData) ? vData : (vData.versions || []);
          setPlanVersions(vList);
          if (vList.length > 0) {
            setFormData((prev) => ({ ...prev, basePlanVersionId: vList[0].id }));
          }
        }
        if (pRes.ok) {
          const pData = await pRes.json();
          const calendars = Array.isArray(pData) ? pData : (pData.calendars || []);
          const pList = calendars.flatMap((c: any) => c.periods || []);
          setPeriods(pList);
          if (pList.length >= 2) {
            setFormData((prev) => ({
              ...prev,
              actualsCutoffPeriodId: pList[0].id,
              forecastHorizonStartId: pList[1].id,
              forecastHorizonEndId: pList[pList.length - 1].id,
            }));
          }
        }
      } catch {
        // quiet fallback
      }
    };
    fetchCycleDetails();
  }, [formData.planningCycleId]);

  const handleCreateForecast = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/forecasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Failed to create forecast version.');
      }
      setFeedback({ type: 'success', message: `Forecast version ${formData.code} created successfully.` });
      setIsCreateModalOpen(false);
      loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    }
  };

  const handleCalculate = async (forecastId: string) => {
    try {
      setCalculatingId(forecastId);
      const res = await fetch(`/api/forecasts/${forecastId}/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Calculation failed.');
      }
      setFeedback({ type: 'success', message: 'Forecast calculated across all periods.' });
      loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setCalculatingId(null);
    }
  };

  const safeForecasts = Array.isArray(forecasts) ? forecasts : [];

  const filteredForecasts = safeForecasts.filter((f) => {
    if (selectedCycleId && f.planningCycle?.id !== selectedCycleId) return false;
    if (selectedType && f.forecastType !== selectedType) return false;
    if (selectedStatus && f.status !== selectedStatus) return false;
    return true;
  });

  const approvedCount = safeForecasts.filter((f) => f.status === 'APPROVED' || f.isPublished).length;
  const rollingCount = safeForecasts.filter((f) => f.forecastType === 'ROLLING_FORECAST').length;
  const scenarioCount = safeForecasts.filter((f) => f.forecastType === 'SCENARIO_FORECAST').length;

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'APPROVED':
      case 'PUBLISHED':
        return 'success';
      case 'IN_REVIEW':
      case 'CALCULATED':
        return 'warning';
      case 'LOCKED':
        return 'neutral';
      case 'REJECTED':
        return 'error';
      default:
        return 'primary';
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Forecasts"
        description="Generate, review, and manage financial and operational forecasts."
        actions={
          <div className="flex gap-2">
            <Link href="/forecasts/rolling">
              <Button variant="outline">Rolling Manager</Button>
            </Link>
            <Link href="/scenarios">
              <Button variant="outline">What-If Scenarios</Button>
            </Link>
            <Button onClick={() => setIsCreateModalOpen(true)}>Create Forecast</Button>
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-white border border-slate-200">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Forecasts</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{safeForecasts.length}</div>
          <div className="text-xs text-slate-500 mt-1">Across all planning cycles</div>
        </Card>
        <Card className="p-4 bg-white border border-slate-200">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Approved / Published</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{approvedCount}</div>
          <div className="text-xs text-slate-500 mt-1">Approved for reporting</div>
        </Card>
        <Card className="p-4 bg-white border border-slate-200">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Rolling Forecasts</div>
          <div className="text-2xl font-bold text-blue-700 mt-1">{rollingCount}</div>
          <div className="text-xs text-slate-500 mt-1">Multi-period projections</div>
        </Card>
        <Card className="p-4 bg-white border border-slate-200">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">What-If Scenarios</div>
          <div className="text-2xl font-bold text-indigo-700 mt-1">{scenarioCount}</div>
          <div className="text-xs text-slate-500 mt-1">Alternative scenario models</div>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <Card className="p-4 bg-white border border-slate-200">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Select
            label="Planning Cycle"
            value={selectedCycleId}
            onChange={(e) => setSelectedCycleId(e.target.value)}
            options={[{ value: '', label: 'All Planning Cycles' }, ...(cycles || []).map((c) => ({ value: c.id, label: c.name }))]}
          />
          <Select
            label="Forecast Type"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            options={[
              { value: '', label: 'All Forecast Types' },
              { value: 'ANNUAL_FORECAST', label: 'Annual Forecast' },
              { value: 'MONTHLY_FORECAST', label: 'Monthly Forecast' },
              { value: 'QUARTERLY_FORECAST', label: 'Quarterly Forecast' },
              { value: 'ROLLING_FORECAST', label: 'Rolling Forecast' },
              { value: 'REFORECAST', label: 'Reforecast' },
              { value: 'SCENARIO_FORECAST', label: 'Scenario Forecast' },
            ]}
          />
          <Select
            label="Status"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'DRAFT', label: 'Draft' },
              { value: 'CALCULATED', label: 'Calculated' },
              { value: 'IN_REVIEW', label: 'In Review' },
              { value: 'APPROVED', label: 'Approved' },
              { value: 'PUBLISHED', label: 'Published' },
              { value: 'LOCKED', label: 'Locked' },
            ]}
          />
          <div className="flex items-end">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setSelectedCycleId('');
                setSelectedType('');
                setSelectedStatus('');
              }}
            >
              Reset Filters
            </Button>
          </div>
        </div>
      </Card>

      {/* Forecast Versions Table */}
      <Card className="bg-white border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading forecast versions...</div>
        ) : filteredForecasts.length === 0 ? (
          <EmptyState
            title="No Forecast Versions Found"
            description="Create your first forecast to combine actuals with projected future manufacturing performance."
            action={<Button onClick={() => setIsCreateModalOpen(true)}>Create Forecast</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Code & Name</th>
                  <th className="py-3 px-4">Cycle</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Method</th>
                  <th className="py-3 px-4">Actuals Cutoff</th>
                  <th className="py-3 px-4">Horizon End</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredForecasts.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50/75 transition-colors">
                    <td className="py-3 px-4 font-medium text-slate-900">
                      <div>
                        <Link href={`/forecasts/${f.id}`} className="hover:text-blue-600 font-semibold">
                          {f.versionCode}
                        </Link>
                      </div>
                      <div className="text-xs text-slate-500">{f.versionName}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{f.planningCycle?.name}</td>
                    <td className="py-3 px-4">
                      <span className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                        {f.forecastType?.replace('_FORECAST', '') || 'STANDARD'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      {f.forecastMethod?.replace(/_/g, ' ') || 'PLAN BASED'}
                    </td>
                    <td className="py-3 px-4 text-xs font-semibold text-blue-800">
                      {f.actualsCutoffPeriod?.periodName || 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      {f.forecastHorizonEnd?.periodName || 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Badge variant={getStatusBadgeVariant(f.status)}>
                        {f.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <Link href={`/forecasts/${f.id}`}>
                        <Button size="sm" variant="outline">View</Button>
                      </Link>
                      {!f.isLocked && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleCalculate(f.id)}
                          disabled={calculatingId === f.id}
                        >
                          {calculatingId === f.id ? 'Running...' : 'Calculate'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create Forecast Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create Forecast Version"
      >
        <form onSubmit={handleCreateForecast} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Version Code *"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              placeholder="e.g. 2026-3+9-FCST"
              required
            />
            <Input
              label="Version Name *"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Q1 Actuals + 9M Forecast"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Planning Cycle *"
              value={formData.planningCycleId}
              onChange={(e) => setFormData({ ...formData, planningCycleId: e.target.value })}
              options={(cycles || []).map((c) => ({ value: c.id, label: c.name }))}
              required
            />
            <Select
              label="Base Plan Version *"
              value={formData.basePlanVersionId}
              onChange={(e) => setFormData({ ...formData, basePlanVersionId: e.target.value })}
              options={(planVersions || []).map((v) => ({ value: v.id, label: `${v.versionCode} - ${v.versionName}` }))}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Forecast Type *"
              value={formData.forecastType}
              onChange={(e) => setFormData({ ...formData, forecastType: e.target.value })}
              options={[
                { value: 'MONTHLY_FORECAST', label: 'Monthly Forecast' },
                { value: 'QUARTERLY_FORECAST', label: 'Quarterly Forecast' },
                { value: 'ANNUAL_FORECAST', label: 'Annual Forecast' },
                { value: 'ROLLING_FORECAST', label: 'Rolling Forecast' },
                { value: 'REFORECAST', label: 'Reforecast' },
              ]}
              required
            />
            <Select
              label="Forecasting Methodology *"
              value={formData.forecastMethod}
              onChange={(e) => setFormData({ ...formData, forecastMethod: e.target.value })}
              options={[
                { value: 'ACTUALS_PLUS_REMAINING_PLAN', label: 'Actuals + Remaining Plan' },
                { value: 'ACTUAL_RUN_RATE', label: 'Actual Run-Rate' },
                { value: 'PLAN_BASED', label: 'Plan Based' },
                { value: 'DRIVER_BASED', label: 'Driver Based' },
                { value: 'PREVIOUS_FORECAST', label: 'Previous Forecast' },
              ]}
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Select
              label="Actuals Cutoff Period *"
              value={formData.actualsCutoffPeriodId}
              onChange={(e) => setFormData({ ...formData, actualsCutoffPeriodId: e.target.value })}
              options={(periods || []).map((p) => ({ value: p.id, label: p.periodName }))}
              required
            />
            <Select
              label="Horizon Start *"
              value={formData.forecastHorizonStartId}
              onChange={(e) => setFormData({ ...formData, forecastHorizonStartId: e.target.value })}
              options={(periods || []).map((p) => ({ value: p.id, label: p.periodName }))}
              required
            />
            <Select
              label="Horizon End *"
              value={formData.forecastHorizonEndId}
              onChange={(e) => setFormData({ ...formData, forecastHorizonEndId: e.target.value })}
              options={(periods || []).map((p) => ({ value: p.id, label: p.periodName }))}
              required
            />
          </div>

          <Input
            label="Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Operational drivers, actual reconciliation context..."
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <Button variant="outline" type="button" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Create Forecast</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
