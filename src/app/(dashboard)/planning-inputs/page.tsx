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
import { INPUT_CATEGORIES, INPUT_SOURCE_TYPES } from '@/lib/validations/plan-inputs';

interface PlanInputItem {
  id: string;
  inputCategory: string;
  inputCode: string;
  inputValue: number;
  unitOfMeasure: string;
  currency: string;
  sourceType: string;
  sourceReference?: string | null;
  isOverridden: boolean;
  overrideReason?: string | null;
  status: string;
  notes?: string | null;
  fiscalPeriod: { id: string; periodName: string; periodNumber: number; fiscalYear: number; quarter: number; status: string };
  plant?: { id: string; code: string; name: string } | null;
  product?: { id: string; code: string; name: string } | null;
  material?: { id: string; code: string; name: string } | null;
  account?: { id: string; code: string; name: string } | null;
  driver?: { id: string; driverCode: string; driverName: string } | null;
}

export default function PlanningInputsWorkspace() {
  const [cycles, setCycles] = useState<any[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string>('');
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');

  const [inputs, setInputs] = useState<PlanInputItem[]>([]);
  const [periods, setPeriods] = useState<any[]>([]);
  const [plants, setPlants] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);

  // Filter Bar
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('ALL');
  const [selectedPlantId, setSelectedPlantId] = useState<string>('ALL');
  const [selectedProductId, setSelectedProductId] = useState<string>('ALL');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Local grid edits: Map<id, number>
  const [pendingValues, setPendingValues] = useState<Record<string, number>>({});
  const [savingBatch, setSavingBatch] = useState(false);

  // Single Add Modal
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formCategory, setFormCategory] = useState<string>(INPUT_CATEGORIES[0]);
  const [formCode, setFormCode] = useState('');
  const [formValue, setFormValue] = useState('');
  const [formUnit, setFormUnit] = useState('EA');
  const [formCurrency, setFormCurrency] = useState('USD');
  const [formPeriodId, setFormPeriodId] = useState('');
  const [formPlantId, setFormPlantId] = useState('');
  const [formProductId, setFormProductId] = useState('');
  const [formMaterialId, setFormMaterialId] = useState('');
  const [formAccountId, setFormAccountId] = useState('');
  const [formSourceType, setFormSourceType] = useState('MANUAL');
  const [formNotes, setFormNotes] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Override Modal
  const [isOverrideOpen, setIsOverrideOpen] = useState(false);
  const [overrideInputItem, setOverrideInputItem] = useState<PlanInputItem | null>(null);
  const [overrideNewValue, setOverrideNewValue] = useState('');
  const [overrideReasonText, setOverrideReasonText] = useState('');

  // Version Copy Modal
  const [isCopyOpen, setIsCopyOpen] = useState(false);
  const [copySourceId, setCopySourceId] = useState('');
  const [copyCategories, setCopyCategories] = useState<string[]>(['INPUTS', 'TARGETS', 'ASSUMPTIONS', 'DRIVERS']);
  const [copyPolicy, setCopyPolicy] = useState<'SKIP' | 'OVERWRITE'>('SKIP');
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    async function loadMasterData() {
      try {
        setLoading(true);
        const [cyclesRes, plantsRes, productsRes, materialsRes, coaRes, calRes, driversRes] = await Promise.all([
          fetch('/api/planning/cycles'),
          fetch('/api/master-data/plants'),
          fetch('/api/master-data/products'),
          fetch('/api/master-data/materials'),
          fetch('/api/master-data/chart-of-accounts'),
          fetch('/api/master-data/fiscal-calendar'),
          fetch('/api/planning/drivers'),
        ]);

        const cyclesData = await cyclesRes.json();
        const plantsData = await plantsRes.json();
        const productsData = await productsRes.json();
        const materialsData = await materialsRes.json();
        const coaData = await coaRes.json();
        const calData = await calRes.json();
        const driversData = await driversRes.json();

        setCycles(cyclesData.cycles || []);
        setPlants(plantsData.plants || []);
        setProducts(productsData.products || []);
        setMaterials(materialsData.materials || []);
        setAccounts(coaData.accounts || []);
        setDrivers(driversData.drivers || []);

        const calendars = calData.calendars || (calData.calendar ? [calData.calendar] : []);
        const allPeriods = calendars.flatMap((c: any) => c.periods || []);
        if (allPeriods.length > 0) {
          setPeriods(allPeriods);
          setFormPeriodId(allPeriods[0].id);
        }

        if (cyclesData.cycles && cyclesData.cycles.length > 0) {
          const firstCycle = cyclesData.cycles[0];
          setSelectedCycleId(firstCycle.id);
          if (firstCycle.planVersions?.length > 0) {
            setVersions(firstCycle.planVersions);
            setSelectedVersionId(firstCycle.planVersions[0].id);
          }
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadMasterData();
  }, []);

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

  const loadInputs = useCallback(async () => {
    if (!selectedVersionId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/planning/inputs?planVersionId=${selectedVersionId}`);
      const data = await res.json();
      setInputs(data.inputs || []);
      setPendingValues({});
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedVersionId]);

  useEffect(() => {
    if (!selectedVersionId) {
      setInputs([]);
      return;
    }
    loadInputs();
  }, [selectedVersionId, loadInputs]);

  const activeVersion = versions.find((v) => v.id === selectedVersionId);
  const isVersionEditable = activeVersion?.status === 'DRAFT' || activeVersion?.status === 'IN_REVIEW';

  const filteredInputs = inputs.filter((item) => {
    if (selectedCategory !== 'ALL' && item.inputCategory !== selectedCategory) return false;
    if (selectedPeriodId !== 'ALL' && item.fiscalPeriod.id !== selectedPeriodId) return false;
    if (selectedPlantId !== 'ALL' && item.plant?.id !== selectedPlantId) return false;
    if (selectedProductId !== 'ALL' && item.product?.id !== selectedProductId) return false;
    return true;
  });

  const overriddenCount = inputs.filter((i) => i.isOverridden).length;
  const hasUnsavedChanges = Object.keys(pendingValues).length > 0;

  function handleCellChange(id: string, val: string) {
    const num = parseFloat(val);
    if (!isNaN(num)) {
      setPendingValues((prev) => ({ ...prev, [id]: num }));
    }
  }

  async function handleBatchSave() {
    if (!selectedVersionId || !selectedCycleId || !hasUnsavedChanges) return;
    setSavingBatch(true);
    setError(null);

    try {
      const inputsToSave = Object.entries(pendingValues).map(([id, val]) => {
        const item = inputs.find((i) => i.id === id)!;
        return {
          planningCycleId: selectedCycleId,
          planVersionId: selectedVersionId,
          fiscalPeriodId: item.fiscalPeriod.id,
          plantId: item.plant?.id || null,
          productId: item.product?.id || null,
          materialId: item.material?.id || null,
          accountId: item.account?.id || null,
          driverId: item.driver?.id || null,
          inputCategory: item.inputCategory as any,
          inputCode: item.inputCode,
          inputValue: val,
          unitOfMeasure: item.unitOfMeasure,
          currency: item.currency,
          sourceType: item.sourceType as any,
          sourceReference: item.sourceReference || null,
          isOverridden: item.isOverridden,
          overrideReason: item.overrideReason || null,
          status: item.status as any,
          notes: item.notes || null,
        };
      });

      const res = await fetch('/api/planning/inputs/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planningCycleId: selectedCycleId,
          planVersionId: selectedVersionId,
          inputs: inputsToSave,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to save batch changes');

      setSuccess(`Successfully saved ${data.count} planning input updates`);
      setPendingValues({});
      loadInputs();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingBatch(false);
    }
  }

  async function handleCreateSingleInput(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedVersionId || !selectedCycleId || !formPeriodId) return;
    setFormSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/planning/inputs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planningCycleId: selectedCycleId,
          planVersionId: selectedVersionId,
          fiscalPeriodId: formPeriodId,
          plantId: formPlantId || null,
          productId: formProductId || null,
          materialId: formMaterialId || null,
          accountId: formAccountId || null,
          inputCategory: formCategory,
          inputCode: formCode.toUpperCase().trim(),
          inputValue: parseFloat(formValue),
          unitOfMeasure: formUnit.trim(),
          currency: formCurrency,
          sourceType: formSourceType,
          notes: formNotes || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to create input');

      setSuccess(`Planning input '${formCode}' created successfully`);
      setIsAddOpen(false);
      setFormCode('');
      setFormValue('');
      loadInputs();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleApplyOverride(e: React.FormEvent) {
    e.preventDefault();
    if (!overrideInputItem || !selectedVersionId || !selectedCycleId) return;
    setError(null);

    try {
      const res = await fetch('/api/planning/inputs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planningCycleId: selectedCycleId,
          planVersionId: selectedVersionId,
          fiscalPeriodId: overrideInputItem.fiscalPeriod.id,
          plantId: overrideInputItem.plant?.id || null,
          productId: overrideInputItem.product?.id || null,
          materialId: overrideInputItem.material?.id || null,
          accountId: overrideInputItem.account?.id || null,
          inputCategory: overrideInputItem.inputCategory,
          inputCode: overrideInputItem.inputCode,
          inputValue: parseFloat(overrideNewValue),
          unitOfMeasure: overrideInputItem.unitOfMeasure,
          currency: overrideInputItem.currency,
          sourceType: overrideInputItem.sourceType,
          isOverridden: true,
          overrideReason: overrideReasonText,
          notes: overrideInputItem.notes,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to apply override');

      setSuccess(`Override applied to ${overrideInputItem.inputCode} with documented rationale`);
      setIsOverrideOpen(false);
      setOverrideInputItem(null);
      setOverrideNewValue('');
      setOverrideReasonText('');
      loadInputs();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleExecuteVersionCopy(e: React.FormEvent) {
    e.preventDefault();
    if (!copySourceId || !selectedVersionId) return;
    setCopying(true);
    setError(null);

    try {
      const res = await fetch('/api/planning/versions/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceVersionId: copySourceId,
          targetVersionId: selectedVersionId,
          categories: copyCategories,
          overwritePolicy: copyPolicy,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Version copy failed');

      setSuccess(`Version copy finished: ${JSON.stringify(data.counts)}`);
      setIsCopyOpen(false);
      loadInputs();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCopying(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planning Inputs"
        description="Enter and manage operational, demand, cost, and capacity planning inputs by version."
        breadcrumbs={[
          { label: 'Planning Workspace', href: '/' },
          { label: 'Planning Inputs' },
        ]}
        actions={
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              disabled={!isVersionEditable}
              onClick={() => {
                const other = versions.find((v) => v.id !== selectedVersionId);
                if (other) setCopySourceId(other.id);
                setIsCopyOpen(true);
              }}
            >
              Copy Version Data
            </Button>
            {hasUnsavedChanges && (
              <Button
                variant="primary"
                disabled={savingBatch}
                onClick={handleBatchSave}
              >
                {savingBatch ? 'Saving...' : `Save Changes (${Object.keys(pendingValues).length})`}
              </Button>
            )}
            <Button
              variant="secondary"
              disabled={!isVersionEditable}
              onClick={() => setIsAddOpen(true)}
            >
              + Add Input
            </Button>
          </div>
        }
      />

      {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert type="success" onClose={() => setSuccess(null)}>{success}</Alert>}

      {/* Version & Grain Filter Bar */}
      <Card>
        <div className="p-4 grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
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
                label: `${v.versionCode} (${v.status})`,
              }))}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Input Category</label>
            <Select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              options={[
                { value: 'ALL', label: 'All Categories' },
                ...INPUT_CATEGORIES.map((cat) => ({ value: cat, label: cat })),
              ]}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Period</label>
            <Select
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
              options={[
                { value: 'ALL', label: 'All 12 Periods' },
                ...periods.map((p) => ({ value: p.id, label: p.periodName })),
              ]}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Plant</label>
            <Select
              value={selectedPlantId}
              onChange={(e) => setSelectedPlantId(e.target.value)}
              options={[
                { value: 'ALL', label: 'All Plants' },
                ...plants.map((p) => ({ value: p.id, label: p.code })),
              ]}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Product</label>
            <Select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              options={[
                { value: 'ALL', label: 'All Products' },
                ...products.map((p) => ({ value: p.id, label: p.code })),
              ]}
            />
          </div>
        </div>
      </Card>

      {/* Summary KPI Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <SummaryMetric
          label="Active Version"
          value={activeVersion?.versionCode || 'None'}
          subtext={`Status: ${activeVersion?.status || 'Draft'}`}
        />
        <SummaryMetric
          label="Input Records"
          value={inputs.length}
          subtext="Total records in version"
        />
        <SummaryMetric
          label="Manual Overrides"
          value={overriddenCount}
          subtext="Manual overrides applied"
        />
        <SummaryMetric
          label="Calculation Status"
          value={inputs.length >= 6 ? 'READY' : 'PENDING'}
          subtext={inputs.length >= 6 ? 'Ready for calculation' : 'Inputs required'}
        />
      </div>

      {/* Financial Planning Input Grid */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-700">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase">
              <tr>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Metric Code</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Plant</th>
                <th className="px-4 py-3">Product / Account</th>
                <th className="px-4 py-3">Source Lineage</th>
                <th className="px-4 py-3 text-right">Value</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Override</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredInputs.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8">
                    <EmptyState
                      title="No Planning Inputs"
                      description="Populate demand, production, material, labor, overhead, or opex inputs to initiate planning."
                      action={
                        isVersionEditable ? (
                          <Button variant="primary" onClick={() => setIsAddOpen(true)}>
                            + Add First Input
                          </Button>
                        ) : undefined
                      }
                    />
                  </td>
                </tr>
              ) : (
                filteredInputs.map((item) => {
                  const currentValue = pendingValues[item.id] !== undefined ? pendingValues[item.id] : item.inputValue;
                  const isPending = pendingValues[item.id] !== undefined;

                  return (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono font-semibold bg-gray-100 px-2 py-0.5 rounded text-gray-700">
                          {item.inputCategory}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-gray-900">{item.inputCode}</td>
                      <td className="px-4 py-3 text-xs font-mono">{item.fiscalPeriod.periodName}</td>
                      <td className="px-4 py-3 text-xs">{item.plant?.code || 'Global'}</td>
                      <td className="px-4 py-3 text-xs">{item.product?.code || item.account?.code || item.material?.code || '—'}</td>
                      <td className="px-4 py-3 text-xs">
                        <span className="inline-block bg-blue-50 text-blue-800 px-2 py-0.5 rounded border border-blue-200">
                          {item.sourceType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isVersionEditable ? (
                          <input
                            type="number"
                            step="any"
                            value={currentValue}
                            onChange={(e) => handleCellChange(item.id, e.target.value)}
                            className={`w-28 text-right px-2 py-1 text-sm font-mono border rounded focus:ring-1 focus:ring-blue-500 ${
                              isPending ? 'bg-amber-50 border-amber-400 font-semibold' : 'bg-white border-gray-300'
                            }`}
                          />
                        ) : (
                          <span className="font-mono font-medium text-gray-900 tabular-nums">
                            {currentValue.toLocaleString()}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 font-mono">{item.unitOfMeasure}</td>
                      <td className="px-4 py-3">
                        {item.isOverridden ? (
                          <span
                            className="cursor-pointer text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-medium inline-block"
                            title={`Reason: ${item.overrideReason}`}
                          >
                            Overridden
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isVersionEditable && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setOverrideInputItem(item);
                              setOverrideNewValue(String(item.inputValue));
                              setOverrideReasonText(item.overrideReason || '');
                              setIsOverrideOpen(true);
                            }}
                          >
                            Override
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Single Input Modal */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Add Single Planning Input"
        maxWidth={640}
      >
        <form onSubmit={handleCreateSingleInput} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Input Category *</label>
              <Select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                options={INPUT_CATEGORIES.map((c) => ({ value: c, label: c }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Input Code *</label>
              <Input
                required
                value={formCode}
                onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                placeholder="e.g. SALES_VOLUME, LABOR_RATE"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Input Value *</label>
              <Input
                type="number"
                step="any"
                required
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
                placeholder="e.g. 1500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Unit of Measure *</label>
              <Input
                required
                value={formUnit}
                onChange={(e) => setFormUnit(e.target.value)}
                placeholder="EA, KG, USD, %"
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
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Plant (Optional)</label>
              <Select
                value={formPlantId}
                onChange={(e) => setFormPlantId(e.target.value)}
                options={[{ value: '', label: 'Global / All Plants' }, ...plants.map((p) => ({ value: p.id, label: p.code }))]}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Product (Optional)</label>
              <Select
                value={formProductId}
                onChange={(e) => setFormProductId(e.target.value)}
                options={[{ value: '', label: 'None' }, ...products.map((p) => ({ value: p.id, label: p.code }))]}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Account (Optional)</label>
              <Select
                value={formAccountId}
                onChange={(e) => setFormAccountId(e.target.value)}
                options={[{ value: '', label: 'None' }, ...accounts.map((a) => ({ value: a.id, label: `${a.code} • ${a.name}` }))]}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Notes / Lineage Reference</label>
            <Input
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="Source contract, engineering sheet or customer quote"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={formSubmitting}>
              {formSubmitting ? 'Saving...' : 'Add Input'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Override Reason Modal */}
      <Modal
        isOpen={isOverrideOpen}
        onClose={() => setIsOverrideOpen(false)}
        title={`Override Planning Input: ${overrideInputItem?.inputCode}`}
        maxWidth={520}
      >
        <form onSubmit={handleApplyOverride} className="space-y-4">
          <p className="text-xs text-gray-600">
            Current Value: <strong>{overrideInputItem?.inputValue} {overrideInputItem?.unitOfMeasure}</strong>. Manual overrides require documented governance rationale.
          </p>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">New Value *</label>
            <Input
              type="number"
              step="any"
              required
              value={overrideNewValue}
              onChange={(e) => setOverrideNewValue(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Mandatory Override Reason *</label>
            <Input
              required
              value={overrideReasonText}
              onChange={(e) => setOverrideReasonText(e.target.value)}
              placeholder="e.g. Overriding baseline machine setup time due to planned CNC upgrade"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <Button type="button" variant="outline" onClick={() => setIsOverrideOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!overrideReasonText.trim()}>
              Save Override
            </Button>
          </div>
        </form>
      </Modal>

      {/* Version Copy Modal */}
      <Modal
        isOpen={isCopyOpen}
        onClose={() => setIsCopyOpen(false)}
        title="Transactionally Copy Version Data"
        maxWidth={640}
      >
        <form onSubmit={handleExecuteVersionCopy} className="space-y-4">
          <p className="text-sm text-gray-600">
            Copy planning structures into <strong>{activeVersion?.versionCode}</strong>.
          </p>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Source Plan Version</label>
            <Select
              value={copySourceId}
              onChange={(e) => setCopySourceId(e.target.value)}
              options={versions
                .filter((v) => v.id !== selectedVersionId)
                .map((v) => ({
                  value: v.id,
                  label: `${v.versionCode} • ${v.versionName} (${v.status})`,
                }))}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-2">Categories to Copy</label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {['INPUTS', 'TARGETS', 'ASSUMPTIONS', 'DRIVERS'].map((cat) => (
                <label key={cat} className="flex items-center gap-2 p-2 border border-gray-200 rounded cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={copyCategories.includes(cat)}
                    onChange={(e) => {
                      if (e.target.checked) setCopyCategories([...copyCategories, cat]);
                      else setCopyCategories(copyCategories.filter((c) => c !== cat));
                    }}
                  />
                  <span>{cat}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Overwrite Policy</label>
            <Select
              value={copyPolicy}
              onChange={(e) => setCopyPolicy(e.target.value as any)}
              options={[
                { value: 'SKIP', label: 'Skip existing (Keep target records intact)' },
                { value: 'OVERWRITE', label: 'Overwrite existing (Replace target records with source)' },
              ]}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <Button type="button" variant="outline" onClick={() => setIsCopyOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={copying || !copySourceId || copyCategories.length === 0}>
              {copying ? 'Copying...' : 'Execute Transactional Copy'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
