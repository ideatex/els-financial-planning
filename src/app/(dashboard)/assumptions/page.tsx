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
import {
  ASSUMPTION_CATEGORIES,
  ASSUMPTION_VALUE_TYPES,
  CONFIDENCE_LEVELS,
} from '@/lib/validations/assumptions';

interface AssumptionItem {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  category: string;
  valueType: string;
  numericValue?: number | null;
  textValue?: string | null;
  booleanValue?: boolean | null;
  dateValue?: string | null;
  unit?: string | null;
  currency?: string | null;
  confidenceLevel: string;
  source?: string | null;
  status: string;
  notes?: string | null;
  effectiveFromPeriod?: { id: string; periodName: string } | null;
  effectiveToPeriod?: { id: string; periodName: string } | null;
  plant?: { id: string; code: string; name: string } | null;
  product?: { id: string; code: string; name: string } | null;
  account?: { id: string; code: string; name: string } | null;
}

export default function AssumptionsPage() {
  const [cycles, setCycles] = useState<any[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string>('');
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');

  const [assumptions, setAssumptions] = useState<AssumptionItem[]>([]);
  const [activeCategoryTab, setActiveCategoryTab] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [periods, setPeriods] = useState<any[]>([]);
  const [plants, setPlants] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState<string>(ASSUMPTION_CATEGORIES[0]);
  const [formValueType, setFormValueType] = useState<string>(ASSUMPTION_VALUE_TYPES[0]);
  const [formNumericVal, setFormNumericVal] = useState('');
  const [formTextVal, setFormTextVal] = useState('');
  const [formBoolVal, setFormBoolVal] = useState('true');
  const [formDateVal, setFormDateVal] = useState('');
  const [formUnit, setFormUnit] = useState('');
  const [formCurrency, setFormCurrency] = useState('USD');
  const [formConfidence, setFormConfidence] = useState<string>('HIGH');
  const [formSource, setFormSource] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formPlantId, setFormPlantId] = useState('');
  const [formProductId, setFormProductId] = useState('');

  // Copy Modal
  const [isCopyOpen, setIsCopyOpen] = useState(false);
  const [copySourceVersionId, setCopySourceVersionId] = useState('');
  const [copyPolicy, setCopyPolicy] = useState<'SKIP' | 'OVERWRITE'>('SKIP');
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    async function loadInitial() {
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
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadInitial();
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

  const loadAssumptions = useCallback(async () => {
    if (!selectedVersionId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/planning/assumptions?planVersionId=${selectedVersionId}`);
      if (!res.ok) throw new Error('Failed to load assumptions');
      const data = await res.json();
      setAssumptions(data.assumptions || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedVersionId]);

  useEffect(() => {
    if (!selectedVersionId) {
      setAssumptions([]);
      return;
    }
    loadAssumptions();
  }, [selectedVersionId, loadAssumptions]);

  const activeVersion = versions.find((v) => v.id === selectedVersionId);
  const isVersionEditable = activeVersion?.status === 'DRAFT' || activeVersion?.status === 'IN_REVIEW';

  const filteredAssumptions = assumptions.filter((item) => {
    if (activeCategoryTab !== 'ALL' && item.category !== activeCategoryTab) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q))
      );
    }
    return true;
  });

  async function handleCreateAssumption(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedVersionId || !selectedCycleId) return;
    setError(null);
    setSubmitting(true);

    try {
      const payload: any = {
        planningCycleId: selectedCycleId,
        planVersionId: selectedVersionId,
        name: formName,
        code: formCode.toUpperCase().trim(),
        description: formDescription || null,
        category: formCategory,
        valueType: formValueType,
        unit: formUnit || null,
        currency: formCurrency || null,
        confidenceLevel: formConfidence,
        source: formSource || null,
        notes: formNotes || null,
        plantId: formPlantId || null,
        productId: formProductId || null,
      };

      if (['NUMBER', 'PERCENTAGE', 'CURRENCY', 'QUANTITY'].includes(formValueType)) {
        payload.numericValue = parseFloat(formNumericVal);
      } else if (formValueType === 'BOOLEAN') {
        payload.booleanValue = formBoolVal === 'true';
      } else if (formValueType === 'TEXT') {
        payload.textValue = formTextVal;
      } else if (formValueType === 'DATE') {
        payload.dateValue = new Date(formDateVal).toISOString();
      }

      const res = await fetch('/api/planning/assumptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to create assumption');

      setSuccess(`Assumption '${formCode}' created successfully`);
      setIsCreateOpen(false);
      resetForm();
      loadAssumptions();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setFormName('');
    setFormCode('');
    setFormDescription('');
    setFormNumericVal('');
    setFormTextVal('');
    setFormNotes('');
  }

  async function handleDeleteAssumption(id: string) {
    if (!confirm('Are you sure you want to delete this assumption?')) return;
    try {
      const res = await fetch(`/api/planning/assumptions/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to delete assumption');
      setSuccess('Assumption deleted successfully');
      loadAssumptions();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleCopyAssumptions(e: React.FormEvent) {
    e.preventDefault();
    if (!copySourceVersionId || !selectedVersionId) return;
    setCopying(true);
    setError(null);

    try {
      const res = await fetch('/api/planning/assumptions/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceVersionId: copySourceVersionId,
          targetVersionId: selectedVersionId,
          overwritePolicy: copyPolicy,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to copy assumptions');

      setSuccess(`Copied ${data.copiedCount} assumption(s), overwritten ${data.overwrittenCount}, skipped ${data.skippedCount}`);
      setIsCopyOpen(false);
      loadAssumptions();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCopying(false);
    }
  }

  function renderFormattedValue(a: AssumptionItem) {
    if (a.valueType === 'PERCENTAGE' && a.numericValue !== null && a.numericValue !== undefined) {
      return `${a.numericValue}%`;
    }
    if (a.valueType === 'CURRENCY' && a.numericValue !== null && a.numericValue !== undefined) {
      return `$${a.numericValue.toLocaleString()}`;
    }
    if (a.valueType === 'NUMBER' || a.valueType === 'QUANTITY') {
      return `${a.numericValue?.toLocaleString()} ${a.unit || ''}`;
    }
    if (a.valueType === 'BOOLEAN') {
      return a.booleanValue ? 'TRUE' : 'FALSE';
    }
    if (a.valueType === 'DATE' && a.dateValue) {
      return new Date(a.dateValue).toLocaleDateString();
    }
    return a.textValue || '—';
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assumption Management"
        description="Economic, operational, pricing, and cost assumptions by plan version."
        breadcrumbs={[
          { label: 'Planning Workspace', href: '/' },
          { label: 'Assumptions' },
        ]}
        actions={
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              disabled={!isVersionEditable}
              onClick={() => {
                const other = versions.find((v) => v.id !== selectedVersionId);
                if (other) setCopySourceVersionId(other.id);
                setIsCopyOpen(true);
              }}
            >
              Copy from Base Version
            </Button>
            <Button
              variant="primary"
              disabled={!isVersionEditable}
              onClick={() => setIsCreateOpen(true)}
            >
              + Create Assumption
            </Button>
          </div>
        }
      />

      {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert type="success" onClose={() => setSuccess(null)}>{success}</Alert>}

      {/* Selector & Search Bar */}
      <Card>
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
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
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Search Assumptions</label>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search code, name, description..."
            />
          </div>
        </div>
      </Card>

      {/* Summary KPI Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryMetric
          label="Total Assumptions"
          value={assumptions.length}
          subtext={activeVersion?.versionCode || 'Current version'}
        />
        <SummaryMetric
          label="High Confidence"
          value={assumptions.filter((a) => a.confidenceLevel === 'HIGH').length}
          subtext="High confidence rating"
        />
        <SummaryMetric
          label="Active Categories"
          value={new Set(assumptions.map((a) => a.category)).size}
          subtext="Assumption categories"
        />
      </div>

      {/* Category Tab Bar */}
      <div className="border-b border-gray-200">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveCategoryTab('ALL')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-t border-b-2 whitespace-nowrap ${
              activeCategoryTab === 'ALL'
                ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            All Categories ({assumptions.length})
          </button>
          {ASSUMPTION_CATEGORIES.map((cat) => {
            const count = assumptions.filter((a) => a.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategoryTab(cat)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-t border-b-2 whitespace-nowrap ${
                  activeCategoryTab === cat
                    ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {cat.replace(/_/g, ' ')} {count > 0 && `(${count})`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Assumptions Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-700">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Assumption Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Value</th>
                <th className="px-4 py-3">Confidence</th>
                <th className="px-4 py-3">Plant / Product</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredAssumptions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8">
                    <EmptyState
                      title="No Assumptions Found"
                      description="Create macro assumptions or copy from a baseline version to parameterize planning models."
                      action={
                        isVersionEditable ? (
                          <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
                            + Create Assumption
                          </Button>
                        ) : undefined
                      }
                    />
                  </td>
                </tr>
              ) : (
                filteredAssumptions.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-gray-900">{item.code}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">{item.name}</span>
                      {item.description && (
                        <span className="block text-xs text-gray-400 truncate max-w-sm">{item.description}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-mono">
                        {item.category.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900 tabular-nums">
                      {renderFormattedValue(item)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          item.confidenceLevel === 'HIGH'
                            ? 'success'
                            : item.confidenceLevel === 'MEDIUM'
                            ? 'warning'
                            : 'neutral'
                        }
                      >
                        {item.confidenceLevel}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {item.plant?.code || item.product?.code || 'Global'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 truncate max-w-xs">{item.source || '—'}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {isVersionEditable && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteAssumption(item.id)}
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

      {/* Create Assumption Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create Plan Version Assumption"
        maxWidth={680}
      >
        <form onSubmit={handleCreateAssumption} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Assumption Code *</label>
              <Input
                required
                value={formCode}
                onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                placeholder="e.g. ASM-PRICE-INC-01"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Assumption Name *</label>
              <Input
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Annual Commercial Price Increase"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Category *</label>
              <Select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                options={ASSUMPTION_CATEGORIES.map((c) => ({ value: c, label: c.replace(/_/g, ' ') }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Value Type *</label>
              <Select
                value={formValueType}
                onChange={(e) => setFormValueType(e.target.value)}
                options={ASSUMPTION_VALUE_TYPES.map((t) => ({ value: t, label: t }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Confidence Level</label>
              <Select
                value={formConfidence}
                onChange={(e) => setFormConfidence(e.target.value)}
                options={CONFIDENCE_LEVELS.map((cl) => ({ value: cl, label: cl }))}
              />
            </div>
          </div>

          {/* Dynamic Value Input */}
          <div className="grid grid-cols-3 gap-4 p-3 bg-gray-50 rounded border border-gray-200">
            {['NUMBER', 'PERCENTAGE', 'CURRENCY', 'QUANTITY'].includes(formValueType) && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Numeric Value *</label>
                <Input
                  type="number"
                  step="any"
                  required
                  value={formNumericVal}
                  onChange={(e) => setFormNumericVal(e.target.value)}
                  placeholder={formValueType === 'PERCENTAGE' ? 'e.g. 5.5' : 'e.g. 1500'}
                />
              </div>
            )}
            {formValueType === 'BOOLEAN' && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Boolean Value</label>
                <Select
                  value={formBoolVal}
                  onChange={(e) => setFormBoolVal(e.target.value)}
                  options={[
                    { value: 'true', label: 'True (Active / Enabled)' },
                    { value: 'false', label: 'False (Inactive / Disabled)' },
                  ]}
                />
              </div>
            )}
            {formValueType === 'TEXT' && (
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Text Value *</label>
                <Input
                  required
                  value={formTextVal}
                  onChange={(e) => setFormTextVal(e.target.value)}
                  placeholder="Descriptive qualitative assumption text"
                />
              </div>
            )}
            {formValueType === 'DATE' && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Date Value *</label>
                <Input
                  type="date"
                  required
                  value={formDateVal}
                  onChange={(e) => setFormDateVal(e.target.value)}
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Unit of Measure</label>
              <Input
                value={formUnit}
                onChange={(e) => setFormUnit(e.target.value)}
                placeholder="%, USD, HRS, DAYS"
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Plant (Optional)</label>
              <Select
                value={formPlantId}
                onChange={(e) => setFormPlantId(e.target.value)}
                options={[{ value: '', label: 'Global / All Plants' }, ...plants.map((p) => ({ value: p.id, label: `${p.code} (${p.city})` }))]}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Product (Optional)</label>
              <Select
                value={formProductId}
                onChange={(e) => setFormProductId(e.target.value)}
                options={[{ value: '', label: 'Global / All Products' }, ...products.map((p) => ({ value: p.id, label: `${p.code} • ${p.name}` }))]}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Source / Citation</label>
              <Input
                value={formSource}
                onChange={(e) => setFormSource(e.target.value)}
                placeholder="Vendor quote, labor contract, tariff memo"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Description / Notes</label>
              <Input
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Supporting background or methodology"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save Assumption'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Copy from Base Version Modal */}
      <Modal
        isOpen={isCopyOpen}
        onClose={() => setIsCopyOpen(false)}
        title="Copy Assumptions from Another Version"
        maxWidth={520}
      >
        <form onSubmit={handleCopyAssumptions} className="space-y-4">
          <p className="text-sm text-gray-600">
            Copy assumptions from a baseline or prior scenario into <strong>{activeVersion?.versionCode}</strong>.
          </p>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Source Version</label>
            <Select
              value={copySourceVersionId}
              onChange={(e) => setCopySourceVersionId(e.target.value)}
              options={versions
                .filter((v) => v.id !== selectedVersionId)
                .map((v) => ({
                  value: v.id,
                  label: `${v.versionCode} • ${v.versionName} (${v.status})`,
                }))}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Overwrite Policy</label>
            <Select
              value={copyPolicy}
              onChange={(e) => setCopyPolicy(e.target.value as any)}
              options={[
                { value: 'SKIP', label: 'Skip existing (Keep target values)' },
                { value: 'OVERWRITE', label: 'Overwrite existing (Replace with source values)' },
              ]}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <Button type="button" variant="outline" onClick={() => setIsCopyOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={copying || !copySourceVersionId}>
              {copying ? 'Copying...' : 'Start Copy'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
