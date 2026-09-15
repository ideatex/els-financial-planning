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
import { DRIVER_CATEGORIES, DRIVER_TYPES } from '@/lib/validations/drivers';

interface DriverItem {
  id: string;
  driverCode: string;
  driverName: string;
  description?: string | null;
  driverCategory: string;
  driverType: string;
  unitOfMeasure: string;
  currency?: string | null;
  defaultValue: number;
  isActive: boolean;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}

interface PlanDriverValueItem {
  id: string;
  driverId: string;
  driverValue: number;
  isOverridden: boolean;
  overrideReason?: string | null;
  status: string;
  notes?: string | null;
  driver: DriverItem;
  fiscalPeriod?: { id: string; periodName: string } | null;
  plant?: { id: string; code: string } | null;
  product?: { id: string; code: string } | null;
}

export default function DriversPage() {
  const [activeTab, setActiveTab] = useState<'LIBRARY' | 'VALUES'>('LIBRARY');

  // Library State
  const [drivers, setDrivers] = useState<DriverItem[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Plan Values State
  const [cycles, setCycles] = useState<any[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string>('');
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [planValues, setPlanValues] = useState<PlanDriverValueItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Define Driver Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState<string>(DRIVER_CATEGORIES[0]);
  const [formType, setFormType] = useState<string>(DRIVER_TYPES[0]);
  const [formUnit, setFormUnit] = useState('HOURS');
  const [formCurrency, setFormCurrency] = useState('USD');
  const [formDefaultVal, setFormDefaultVal] = useState('0');
  const [submitting, setSubmitting] = useState(false);

  // Override Modal
  const [isOverrideOpen, setIsOverrideOpen] = useState(false);
  const [selectedDriverForOverride, setSelectedDriverForOverride] = useState<DriverItem | null>(null);
  const [overrideValue, setOverrideValue] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideNotes, setOverrideNotes] = useState('');
  const [savingOverride, setSavingOverride] = useState(false);

  useEffect(() => {
    loadDrivers();
    loadCycles();
  }, []);

  async function loadDrivers() {
    try {
      setLoading(true);
      const res = await fetch('/api/planning/drivers');
      const data = await res.json();
      setDrivers(data.drivers || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadCycles() {
    try {
      const res = await fetch('/api/planning/cycles');
      const data = await res.json();
      setCycles(data.cycles || []);

      if (data.cycles && data.cycles.length > 0) {
        setSelectedCycleId(data.cycles[0].id);
        if (data.cycles[0].planVersions?.length > 0) {
          setVersions(data.cycles[0].planVersions);
          setSelectedVersionId(data.cycles[0].planVersions[0].id);
        }
      }
    } catch (err: any) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (!selectedCycleId) return;
    const cycle = cycles.find((c) => c.id === selectedCycleId);
    if (cycle && cycle.planVersions) {
      setVersions(cycle.planVersions);
      if (cycle.planVersions.length > 0) {
        setSelectedVersionId(cycle.planVersions[0].id);
      }
    }
  }, [selectedCycleId, cycles]);

  const loadPlanValues = useCallback(async () => {
    if (!selectedVersionId) return;
    try {
      const res = await fetch(`/api/planning/drivers/values?planVersionId=${selectedVersionId}`);
      const data = await res.json();
      setPlanValues(data.values || []);
    } catch (err: any) {
      setError(err.message);
    }
  }, [selectedVersionId]);

  useEffect(() => {
    if (!selectedVersionId) return;
    loadPlanValues();
  }, [selectedVersionId, loadPlanValues]);

  const activeVersion = versions.find((v) => v.id === selectedVersionId);
  const isVersionEditable = activeVersion?.status === 'DRAFT' || activeVersion?.status === 'IN_REVIEW';

  const filteredDrivers = drivers.filter((d) => {
    if (categoryFilter !== 'ALL' && d.driverCategory !== categoryFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        d.driverCode.toLowerCase().includes(q) ||
        d.driverName.toLowerCase().includes(q) ||
        (d.description && d.description.toLowerCase().includes(q))
      );
    }
    return true;
  });

  async function handleCreateDriver(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/planning/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverCode: formCode.toUpperCase().trim(),
          driverName: formName.trim(),
          description: formDescription || null,
          driverCategory: formCategory,
          driverType: formType,
          unitOfMeasure: formUnit.trim(),
          currency: formCurrency || 'USD',
          defaultValue: parseFloat(formDefaultVal),
          isActive: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to define driver');

      setSuccess(`Driver '${formCode}' created successfully`);
      setIsCreateOpen(false);
      resetCreateForm();
      loadDrivers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function resetCreateForm() {
    setFormCode('');
    setFormName('');
    setFormDescription('');
    setFormDefaultVal('0');
  }

  async function handleSaveOverride(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDriverForOverride || !selectedVersionId) return;
    setSavingOverride(true);
    setError(null);

    try {
      const res = await fetch('/api/planning/drivers/values', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planVersionId: selectedVersionId,
          driverId: selectedDriverForOverride.id,
          driverValue: parseFloat(overrideValue),
          isOverridden: true,
          overrideReason,
          notes: overrideNotes || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to save driver override');

      setSuccess(`Override saved for driver '${selectedDriverForOverride.driverCode}'`);
      setIsOverrideOpen(false);
      setSelectedDriverForOverride(null);
      setOverrideValue('');
      setOverrideReason('');
      setOverrideNotes('');
      loadPlanValues();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingOverride(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Drivers"
        description="Manage operational and financial calculation drivers and version overrides."
        breadcrumbs={[
          { label: 'Planning Workspace', href: '/' },
          { label: 'Drivers' },
        ]}
        actions={
          activeTab === 'LIBRARY' ? (
            <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
              + Define Driver
            </Button>
          ) : undefined
        }
      />

      {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert type="success" onClose={() => setSuccess(null)}>{success}</Alert>}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('LIBRARY')}
            className={`pb-2 text-sm font-semibold border-b-2 ${
              activeTab === 'LIBRARY'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Global Driver Library ({drivers.length})
          </button>
          <button
            onClick={() => setActiveTab('VALUES')}
            className={`pb-2 text-sm font-semibold border-b-2 ${
              activeTab === 'VALUES'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Plan Version Overrides ({planValues.length})
          </button>
        </div>
      </div>

      {activeTab === 'LIBRARY' ? (
        <>
          {/* Library Filters */}
          <Card>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Category Filter</label>
                <Select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  options={[
                    { value: 'ALL', label: 'All Driver Categories' },
                    ...DRIVER_CATEGORIES.map((c) => ({ value: c, label: c.replace(/_/g, ' ') })),
                  ]}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Search Drivers</label>
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search code, name, description..."
                />
              </div>
            </div>
          </Card>

          {/* Drivers Table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-700">
                <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase">
                  <tr>
                    <th className="px-4 py-3">Driver Code</th>
                    <th className="px-4 py-3">Driver Name</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3 text-right">Default Value</th>
                    <th className="px-4 py-3">Unit</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredDrivers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8">
                        <EmptyState
                          title="No Drivers Defined"
                          description="Define reusable operational variables like scrap rate, machine run hours, or tax rates."
                          action={
                            <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
                              + Define Driver
                            </Button>
                          }
                        />
                      </td>
                    </tr>
                  ) : (
                    filteredDrivers.map((driver) => (
                      <tr key={driver.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-mono font-medium text-gray-900">{driver.driverCode}</td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-gray-900">{driver.driverName}</span>
                          {driver.description && (
                            <span className="block text-xs text-gray-400 truncate max-w-sm">
                              {driver.description}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-mono">
                            {driver.driverCategory.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">{driver.driverType}</td>
                        <td className="px-4 py-3 text-right font-mono font-medium text-gray-900 tabular-nums">
                          {driver.defaultValue.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 font-mono">{driver.unitOfMeasure}</td>
                        <td className="px-4 py-3">
                          <Badge variant={driver.isActive ? 'success' : 'neutral'}>
                            {driver.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setSelectedDriverForOverride(driver);
                              setOverrideValue(String(driver.defaultValue));
                              setIsOverrideOpen(true);
                            }}
                          >
                            Set Version Value
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : (
        <>
          {/* Plan Version Selector */}
          <Card>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
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
            </div>
          </Card>

          {/* Overrides Table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-700">
                <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase">
                  <tr>
                    <th className="px-4 py-3">Driver</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3 text-right">Default Value</th>
                    <th className="px-4 py-3 text-right">Version Value</th>
                    <th className="px-4 py-3">Override Status</th>
                    <th className="px-4 py-3">Override Reason</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {planValues.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8">
                        <EmptyState
                          title="No Driver Overrides Set"
                          description="This plan version currently uses standard default driver values. Set overrides from the Global Driver Library tab."
                          action={
                            <Button variant="secondary" onClick={() => setActiveTab('LIBRARY')}>
                              Browse Driver Library
                            </Button>
                          }
                        />
                      </td>
                    </tr>
                  ) : (
                    planValues.map((pv) => (
                      <tr key={pv.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono font-medium text-gray-900">{pv.driver.driverCode}</span>
                          <span className="block text-xs text-gray-500">{pv.driver.driverName}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 font-mono">
                          {pv.driver.driverCategory.replace(/_/g, ' ')}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-500 tabular-nums">
                          {pv.driver.defaultValue} {pv.driver.unitOfMeasure}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-blue-900 tabular-nums">
                          {pv.driverValue} {pv.driver.unitOfMeasure}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={pv.isOverridden ? 'warning' : 'neutral'}>
                            {pv.isOverridden ? 'Overridden' : 'Standard'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 italic">
                          {pv.overrideReason || '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isVersionEditable && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedDriverForOverride(pv.driver);
                                setOverrideValue(String(pv.driverValue));
                                setOverrideReason(pv.overrideReason || '');
                                setOverrideNotes(pv.notes || '');
                                setIsOverrideOpen(true);
                              }}
                            >
                              Edit Override
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
        </>
      )}

      {/* Define Driver Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Define Global Operational / Financial Driver"
        maxWidth={680}
      >
        <form onSubmit={handleCreateDriver} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Driver Code *</label>
              <Input
                required
                value={formCode}
                onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                placeholder="e.g. DRV-SCRAP-01"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Driver Name *</label>
              <Input
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Primary Stamping Scrap Rate"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Category *</label>
              <Select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                options={DRIVER_CATEGORIES.map((c) => ({ value: c, label: c.replace(/_/g, ' ') }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Driver Type *</label>
              <Select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                options={DRIVER_TYPES.map((t) => ({ value: t, label: t }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Default Value *</label>
              <Input
                type="number"
                step="any"
                required
                value={formDefaultVal}
                onChange={(e) => setFormDefaultVal(e.target.value)}
                placeholder="e.g. 2.5"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Unit of Measure *</label>
              <Input
                required
                value={formUnit}
                onChange={(e) => setFormUnit(e.target.value)}
                placeholder="PERCENT, HOURS, USD, DAYS"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Description</label>
              <Input
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Operational purpose or methodology"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Defining...' : 'Define Driver'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Set Version Override Modal */}
      <Modal
        isOpen={isOverrideOpen}
        onClose={() => setIsOverrideOpen(false)}
        title={`Set Plan Override: ${selectedDriverForOverride?.driverCode}`}
        maxWidth={520}
      >
        <form onSubmit={handleSaveOverride} className="space-y-4">
          <p className="text-xs text-gray-500">
            Override the default value ({selectedDriverForOverride?.defaultValue} {selectedDriverForOverride?.unitOfMeasure}) for plan version <strong>{activeVersion?.versionCode}</strong>.
          </p>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Overridden Value *</label>
            <Input
              type="number"
              step="any"
              required
              value={overrideValue}
              onChange={(e) => setOverrideValue(e.target.value)}
              placeholder="e.g. 3.2"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Mandatory Override Reason *</label>
            <Input
              required
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="e.g. Material supplier re-tooling in Q3 requires temporary scrap allowance"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Additional Notes</label>
            <Input
              value={overrideNotes}
              onChange={(e) => setOverrideNotes(e.target.value)}
              placeholder="Optional governance notes"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <Button type="button" variant="outline" onClick={() => setIsOverrideOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={savingOverride || !overrideReason.trim()}>
              {savingOverride ? 'Saving...' : 'Save Override'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
