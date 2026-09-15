'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { SummaryMetric } from '@/components/ui/SummaryMetric';
import { TARGET_METRICS, TARGET_SOURCE_TYPES } from '@/lib/validations/targets';

interface TargetItem {
  id: string;
  targetMetric: string;
  targetValue: number;
  unitOfMeasure: string;
  currency: string;
  sourceType: string;
  sourceReference?: string | null;
  notes?: string | null;
  status: string;
  fiscalPeriod: { id: string; periodName: string; periodNumber: number; fiscalYear: number; quarter: number };
  plant?: { id: string; code: string; name: string } | null;
  product?: { id: string; code: string; name: string } | null;
  account?: { id: string; code: string; name: string } | null;
  planVersion: { id: string; versionCode: string; versionName: string; status: string };
}

export default function ManagementTargetsPage() {
  const [cycles, setCycles] = useState<any[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string>('');
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');

  const [targets, setTargets] = useState<TargetItem[]>([]);
  const [periods, setPeriods] = useState<any[]>([]);
  const [plants, setPlants] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);

  const [metricFilter, setMetricFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modal states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [targetToReject, setTargetToReject] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // New Target Form
  const [formMetric, setFormMetric] = useState<string>(TARGET_METRICS[0]);
  const [formValue, setFormValue] = useState<string>('');
  const [formUnit, setFormUnit] = useState<string>('USD');
  const [formCurrency, setFormCurrency] = useState<string>('USD');
  const [formPeriodId, setFormPeriodId] = useState<string>('');
  const [formPlantId, setFormPlantId] = useState<string>('');
  const [formProductId, setFormProductId] = useState<string>('');
  const [formAccountId, setFormAccountId] = useState<string>('');
  const [formSourceType, setFormSourceType] = useState<string>('MANUAL_ENTRY');
  const [formNotes, setFormNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // Bulk Import Form
  const [importCsvText, setImportCsvText] = useState('');
  const [importReport, setImportReport] = useState<any | null>(null);
  const [importing, setImporting] = useState(false);

  // Load initial cycles and master data
  useEffect(() => {
    async function loadInitialData() {
      try {
        setLoading(true);
        const [cyclesRes, plantsRes, productsRes, coaRes, calRes] = await Promise.all([
          fetch('/api/planning/cycles'),
          fetch('/api/master-data/plants'),
          fetch('/api/master-data/products'),
          fetch('/api/master-data/chart-of-accounts'),
          fetch('/api/master-data/fiscal-calendar'),
        ]);

        const cyclesData = await cyclesRes.json();
        const plantsData = await plantsRes.json();
        const productsData = await productsRes.json();
        const coaData = await coaRes.json();
        const calData = await calRes.json();

        setCycles(cyclesData.cycles || []);
        setPlants(plantsData.plants || []);
        setProducts(productsData.products || []);
        setAccounts(coaData.accounts || []);

        const calendars = calData.calendars || (calData.calendar ? [calData.calendar] : []);
        const allPeriods = calendars.flatMap((c: any) => c.periods || []);
        if (allPeriods.length > 0) {
          setPeriods(allPeriods);
          setFormPeriodId(allPeriods[0].id);
        }

        if (cyclesData.cycles && cyclesData.cycles.length > 0) {
          const firstCycle = cyclesData.cycles[0];
          setSelectedCycleId(firstCycle.id);
          if (firstCycle.planVersions && firstCycle.planVersions.length > 0) {
            setVersions(firstCycle.planVersions);
            setSelectedVersionId(firstCycle.planVersions[0].id);
          }
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load initial data');
      } finally {
        setLoading(false);
      }
    }
    loadInitialData();
  }, []);

  // Update versions when cycle changes
  useEffect(() => {
    if (!selectedCycleId) return;
    const cycle = cycles.find((c) => c.id === selectedCycleId);
    if (cycle && cycle.planVersions) {
      setVersions(cycle.planVersions);
      if (cycle.planVersions.length > 0) {
        setSelectedVersionId(cycle.planVersions[0].id);
      } else {
        setSelectedVersionId('');
      }
    }
  }, [selectedCycleId, cycles]);

  const loadTargets = useCallback(async () => {
    if (!selectedVersionId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/planning/targets?planVersionId=${selectedVersionId}`);
      if (!res.ok) throw new Error('Failed to fetch management targets');
      const data = await res.json();
      setTargets(data.targets || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedVersionId]);

  // Load targets when version changes
  useEffect(() => {
    if (!selectedVersionId) {
      setTargets([]);
      return;
    }
    loadTargets();
  }, [selectedVersionId, loadTargets]);

  const activeVersion = versions.find((v) => v.id === selectedVersionId);
  const isVersionEditable = activeVersion?.status === 'DRAFT' || activeVersion?.status === 'IN_REVIEW';

  // Metrics
  const totalCount = targets.length;
  const approvedCount = targets.filter((t) => t.status === 'APPROVED').length;
  const revenueTarget = targets
    .filter((t) => t.targetMetric === 'REVENUE')
    .reduce((sum, t) => sum + t.targetValue, 0);

  // Filtered targets
  const filteredTargets = targets.filter((t) => {
    if (metricFilter !== 'ALL' && t.targetMetric !== metricFilter) return false;
    if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
    return true;
  });

  async function handleCreateTarget(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedVersionId || !selectedCycleId || !formPeriodId) return;
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/planning/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planningCycleId: selectedCycleId,
          planVersionId: selectedVersionId,
          fiscalPeriodId: formPeriodId,
          targetMetric: formMetric,
          targetValue: parseFloat(formValue),
          unitOfMeasure: formUnit,
          currency: formCurrency,
          plantId: formPlantId || null,
          productId: formProductId || null,
          accountId: formAccountId || null,
          sourceType: formSourceType,
          notes: formNotes || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to create management target');
      }

      setSuccess(`Management target for ${formMetric} created successfully`);
      setIsCreateOpen(false);
      setFormValue('');
      setFormNotes('');
      loadTargets();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(targetId: string, status: string, reason?: string) {
    setError(null);
    try {
      const res = await fetch(`/api/planning/targets/${targetId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, rejectionReason: reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to update target status');

      setSuccess(`Target status updated to ${status}`);
      if (isRejectOpen) {
        setIsRejectOpen(false);
        setRejectionReason('');
        setTargetToReject(null);
      }
      loadTargets();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleDeleteTarget(targetId: string) {
    if (!confirm('Are you sure you want to delete this target?')) return;
    setError(null);
    try {
      const res = await fetch(`/api/planning/targets/${targetId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to delete target');
      setSuccess('Target deleted successfully');
      loadTargets();
    } catch (err: any) {
      setError(err.message);
    }
  }

  function handleParseCsvPreview() {
    if (!importCsvText.trim()) return;
    try {
      const lines = importCsvText.trim().split('\n');
      const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const rows = [];

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const cols = lines[i].split(',').map((c) => c.trim());
        const rowObj: any = {};
        header.forEach((h, idx) => {
          rowObj[h] = cols[idx];
        });

        // Match period
        const periodMatch = periods.find(
          (p) => p.periodNumber === parseInt(rowObj.period) || p.periodName.toLowerCase().includes((rowObj.period || '').toLowerCase())
        );

        // Match plant
        const plantMatch = plants.find(
          (p) => p.code.toLowerCase() === (rowObj.plant || '').toLowerCase()
        );

        // Match product
        const prodMatch = products.find(
          (p) => p.code.toLowerCase() === (rowObj.product || '').toLowerCase()
        );

        rows.push({
          fiscalPeriodId: periodMatch ? periodMatch.id : rowObj.period,
          plantId: plantMatch ? plantMatch.id : null,
          productId: prodMatch ? prodMatch.id : null,
          targetMetric: rowObj.metric?.toUpperCase(),
          targetValue: parseFloat(rowObj.value || '0'),
          unitOfMeasure: rowObj.unit || 'USD',
          currency: rowObj.currency || 'USD',
          sourceType: 'CSV_IMPORT',
          notes: rowObj.notes || null,
        });
      }

      submitBulkImport(rows, false);
    } catch (err: any) {
      setError('Failed to parse CSV: ' + err.message);
    }
  }

  async function submitBulkImport(rows: any[], commit: boolean) {
    if (!selectedVersionId || !selectedCycleId) return;
    setImporting(true);
    setError(null);
    try {
      const res = await fetch(`/api/planning/targets/import?commit=${commit}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planningCycleId: selectedCycleId,
          planVersionId: selectedVersionId,
          fileName: 'manual_targets_upload.csv',
          rows,
        }),
      });

      const report = await res.json();
      if (!res.ok) throw new Error(report.error?.message || 'Bulk import failed');

      setImportReport(report);
      if (commit) {
        setSuccess(`Successfully imported ${report.validRows} target(s)`);
        setIsImportOpen(false);
        setImportCsvText('');
        setImportReport(null);
        loadTargets();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Management Targets"
        description="Define and monitor top-down financial and operational targets by fiscal period."
        breadcrumbs={[
          { label: 'Planning Workspace', href: '/' },
          { label: 'Targets' },
        ]}
        actions={
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              disabled={!isVersionEditable}
              onClick={() => {
                setImportReport(null);
                setIsImportOpen(true);
              }}
            >
              Bulk Import CSV
            </Button>
            <Button
              variant="primary"
              disabled={!isVersionEditable}
              onClick={() => setIsCreateOpen(true)}
            >
              + New Target
            </Button>
          </div>
        }
      />

      {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert type="success" onClose={() => setSuccess(null)}>{success}</Alert>}

      {/* Version Context & Filter Bar */}
      <Card>
        <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Planning Cycle</label>
            <Select
              value={selectedCycleId}
              onChange={(e) => setSelectedCycleId(e.target.value)}
              options={cycles.map((c) => ({ value: c.id, label: `${c.name} (FY${c.fiscalYear})` }))}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Plan Version</label>
            <Select
              value={selectedVersionId}
              onChange={(e) => setSelectedVersionId(e.target.value)}
              options={versions.map((v) => ({
                value: v.id,
                label: `${v.versionCode} • ${v.versionName} (${v.status})`,
              }))}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Metric Filter</label>
            <Select
              value={metricFilter}
              onChange={(e) => setMetricFilter(e.target.value)}
              options={[
                { value: 'ALL', label: 'All Target Metrics' },
                ...TARGET_METRICS.map((m) => ({ value: m, label: m.replace(/_/g, ' ') })),
              ]}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Status Filter</label>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: 'ALL', label: 'All Statuses' },
                { value: 'DRAFT', label: 'Draft' },
                { value: 'SUBMITTED', label: 'Submitted' },
                { value: 'APPROVED', label: 'Approved' },
                { value: 'REJECTED', label: 'Rejected' },
                { value: 'LOCKED', label: 'Locked' },
              ]}
            />
          </div>
        </div>
      </Card>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryMetric
          label="Total Targets"
          value={totalCount}
          subtext={activeVersion?.versionCode || 'Selected version'}
        />
        <SummaryMetric
          label="Approved Targets"
          value={approvedCount}
          subtext={`${totalCount > 0 ? Math.round((approvedCount / totalCount) * 100) : 0}% approved`}
        />
        <SummaryMetric
          label="Total Revenue Target"
          value={`$${revenueTarget.toLocaleString()}`}
          subtext="Annualized revenue target"
        />
      </div>

      {/* Targets Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-700">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase">
              <tr>
                <th className="px-4 py-3">Metric</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Plant</th>
                <th className="px-4 py-3">Product / Account</th>
                <th className="px-4 py-3 text-right">Target Value</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredTargets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8">
                    <EmptyState
                      title="No Management Targets Found"
                      description="Create top-down targets or bulk import them to guide financial scenario modeling."
                      action={
                        isVersionEditable ? (
                          <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
                            + Create Target
                          </Button>
                        ) : undefined
                      }
                    />
                  </td>
                </tr>
              ) : (
                filteredTargets.map((target) => (
                  <tr key={target.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {target.targetMetric.replace(/_/g, ' ')}
                      {target.notes && (
                        <span className="block text-xs text-gray-400 truncate max-w-xs">{target.notes}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{target.fiscalPeriod.periodName}</td>
                    <td className="px-4 py-3">{target.plant?.code || '—'}</td>
                    <td className="px-4 py-3">{target.product?.code || target.account?.code || '—'}</td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-gray-900 tabular-nums">
                      {target.targetMetric.includes('PERCENT')
                        ? `${target.targetValue.toFixed(1)}%`
                        : target.currency === 'USD'
                        ? `$${target.targetValue.toLocaleString()}`
                        : `${target.targetValue.toLocaleString()} ${target.unitOfMeasure}`}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      <span className="inline-block bg-gray-100 px-2 py-0.5 rounded text-gray-700">
                        {target.sourceType.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          target.status === 'APPROVED'
                            ? 'success'
                            : target.status === 'SUBMITTED'
                            ? 'primary'
                            : target.status === 'REJECTED'
                            ? 'danger'
                            : target.status === 'LOCKED'
                            ? 'neutral'
                            : 'warning'
                        }
                      >
                        {target.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                      {target.status === 'DRAFT' && isVersionEditable && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleStatusChange(target.id, 'SUBMITTED')}
                        >
                          Submit
                        </Button>
                      )}
                      {target.status === 'SUBMITTED' && (
                        <>
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleStatusChange(target.id, 'APPROVED')}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => {
                              setTargetToReject(target.id);
                              setIsRejectOpen(true);
                            }}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                      {target.status === 'DRAFT' && isVersionEditable && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteTarget(target.id)}
                        >
                          Delete
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create Target Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create Management Target"
        maxWidth={680}
      >
        <form onSubmit={handleCreateTarget} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Target Metric *</label>
              <Select
                value={formMetric}
                onChange={(e) => setFormMetric(e.target.value)}
                options={TARGET_METRICS.map((m) => ({ value: m, label: m.replace(/_/g, ' ') }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Fiscal Period *</label>
              <Select
                value={formPeriodId}
                onChange={(e) => setFormPeriodId(e.target.value)}
                options={periods.map((p) => ({ value: p.id, label: p.periodName }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Target Value *</label>
              <Input
                type="number"
                step="any"
                required
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
                placeholder="e.g. 500000"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Unit of Measure *</label>
              <Input
                required
                value={formUnit}
                onChange={(e) => setFormUnit(e.target.value)}
                placeholder="USD, EA, KG, %"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Currency</label>
              <Input
                maxLength={3}
                value={formCurrency}
                onChange={(e) => setFormCurrency(e.target.value.toUpperCase())}
                placeholder="USD"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Plant (Optional)</label>
              <Select
                value={formPlantId}
                onChange={(e) => setFormPlantId(e.target.value)}
                options={[{ value: '', label: 'All Plants' }, ...plants.map((p) => ({ value: p.id, label: `${p.code} (${p.city})` }))]}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Product (Optional)</label>
              <Select
                value={formProductId}
                onChange={(e) => setFormProductId(e.target.value)}
                options={[{ value: '', label: 'All Products' }, ...products.map((p) => ({ value: p.id, label: `${p.code} • ${p.name}` }))]}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Account (Optional)</label>
              <Select
                value={formAccountId}
                onChange={(e) => setFormAccountId(e.target.value)}
                options={[{ value: '', label: 'All Accounts' }, ...accounts.map((a) => ({ value: a.id, label: `${a.code} • ${a.name}` }))]}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Source Type</label>
              <Select
                value={formSourceType}
                onChange={(e) => setFormSourceType(e.target.value)}
                options={TARGET_SOURCE_TYPES.map((s) => ({ value: s, label: s.replace(/_/g, ' ') }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Notes / Guidance</label>
              <Input
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Rationale, source document or target assumption"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save Target'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reject Modal */}
      <Modal
        isOpen={isRejectOpen}
        onClose={() => setIsRejectOpen(false)}
        title="Reject Management Target"
        maxWidth={520}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Provide a mandatory rejection reason so the planning team can revise the target assumptions.
          </p>
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Rejection Reason *</label>
            <Input
              required
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Target revenue exceeds plant capacity limits by 20%"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <Button variant="outline" onClick={() => setIsRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!rejectionReason.trim()}
              onClick={() => targetToReject && handleStatusChange(targetToReject, 'REJECTED', rejectionReason)}
            >
              Confirm Rejection
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk CSV Import Modal */}
      <Modal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        title="Bulk Import Management Targets"
        maxWidth={760}
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Paste CSV data with headers: <code>period,metric,value,unit,plant,product,notes</code>
          </p>
          <textarea
            className="w-full h-36 font-mono text-xs p-3 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
            placeholder={`period,metric,value,unit,plant,product,notes\n1,REVENUE,500000,USD,DET-01,FG-ACTUATOR-500,Midwest Q1 target\n2,REVENUE,520000,USD,DET-01,FG-ACTUATOR-500,Midwest Q2 target`}
            value={importCsvText}
            onChange={(e) => setImportCsvText(e.target.value)}
          />

          <div className="flex gap-3">
            <Button variant="secondary" onClick={handleParseCsvPreview} disabled={!importCsvText.trim() || importing}>
              Validate & Preview
            </Button>
          </div>

          {importReport && (
            <div className="border border-gray-200 rounded p-4 space-y-3 bg-gray-50">
              <div className="flex justify-between items-center text-sm font-semibold">
                <span>Validation Summary</span>
                <span className="text-xs">
                  Total: {importReport.totalRows} | Valid: <span className="text-green-600">{importReport.validRows}</span> | Invalid: <span className="text-red-600">{importReport.invalidRows}</span>
                </span>
              </div>

              {importReport.errors.length > 0 && (
                <div className="bg-red-50 text-red-700 p-3 rounded text-xs max-h-32 overflow-y-auto space-y-1 border border-red-200">
                  {importReport.errors.map((err: any, i: number) => (
                    <div key={i}>Row {err.row}: {err.error}</div>
                  ))}
                </div>
              )}

              {importReport.preview.length > 0 && (
                <div className="overflow-x-auto text-xs">
                  <table className="w-full bg-white border border-gray-200">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="p-1 border">Metric</th>
                        <th className="p-1 border">Value</th>
                        <th className="p-1 border">Unit</th>
                        <th className="p-1 border">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importReport.preview.map((row: any, i: number) => (
                        <tr key={i}>
                          <td className="p-1 border">{row.targetMetric}</td>
                          <td className="p-1 border text-right">{row.targetValue}</td>
                          <td className="p-1 border">{row.unitOfMeasure}</td>
                          <td className="p-1 border">{row.sourceType}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button
                  variant="primary"
                  disabled={importReport.invalidRows > 0 || importing}
                  onClick={() => submitBulkImport(importReport.preview, true)}
                >
                  {importing ? 'Importing...' : `Commit ${importReport.validRows} Valid Record(s)`}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
