'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';

interface ActualBatch {
  id: string;
  name: string;
  originalFileName: string;
  fileSize: number;
  importType: string;
  currency: string;
  status: string;
  controlTotal: number | null;
  importedTotal: number | null;
  acceptedRowCount: number;
  rejectedRowCount: number;
  errorCount: number;
  warningCount: number;
  reconciliationStatus: string;
  createdAt: string;
  fiscalPeriod: { id: string; periodName: string };
  plant: { id: string; name: string; code: string } | null;
  uploadedByUser: { id: string; name: string; email: string };
}

interface ReconciliationItem {
  id: string;
  reconciliationType: string;
  status: 'BALANCED' | 'UNBALANCED' | 'WARNING' | 'FAILED';
  expectedValue: number;
  actualValue: number;
  difference: number;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  explanation: string;
  suggestedResolution?: string;
}

interface ImportRowItem {
  id: string;
  rowNumber: number;
  rawPayload: string;
  validationStatus: string;
  errorMessages: string | null;
  warningMessages: string | null;
  resolvedEntityReferences: string | null;
}

export default function ActualsManagementPage() {
  const [batches, setBatches] = useState<ActualBatch[]>([]);
  const [periods, setPeriods] = useState<Array<{ id: string; periodName: string }>>([]);
  const [plants, setPlants] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [selectedPlant, setSelectedPlant] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');

  // Upload Wizard States
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadStep, setUploadStep] = useState<1 | 2 | 3 | 4>(1);
  const [batchName, setBatchName] = useState('');
  const [importType, setImportType] = useState('REVENUE_ACTUALS');
  const [uploadPeriodId, setUploadPeriodId] = useState('');
  const [uploadPlantId, setUploadPlantId] = useState('');
  const [controlTotal, setControlTotal] = useState('');
  const [csvContent, setCsvContent] = useState('');
  const [fileName, setFileName] = useState('actuals_import.csv');
  const [createdBatchId, setCreatedBatchId] = useState<string | null>(null);
  const [profilingData, setProfilingData] = useState<{
    rowCount: number;
    columnNames: string[];
    sampleRows: Record<string, string>[];
  } | null>(null);
  const [mappingConfig, setMappingConfig] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState(false);

  // Reconciliation Drawer
  const [activeReconBatch, setActiveReconBatch] = useState<ActualBatch | null>(null);
  const [reconResults, setReconResults] = useState<ReconciliationItem[]>([]);
  const [reconLoading, setReconLoading] = useState(false);

  // Row Inspector Drawer
  const [activeRowsBatch, setActiveRowsBatch] = useState<ActualBatch | null>(null);
  const [rowsList, setRowsList] = useState<ImportRowItem[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);

  // Reversal Modal
  const [reverseBatchId, setReverseBatchId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState('');

  useEffect(() => {
    loadMetadata();
  }, []);

  useEffect(() => {
    loadBatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod, selectedPlant, selectedStatus]);

  async function loadMetadata() {
    try {
      const [periodsRes, plantsRes] = await Promise.all([
        fetch('/api/master-data/fiscal-calendar'),
        fetch('/api/master-data/plants'),
      ]);

      if (periodsRes.ok) {
        const data = await periodsRes.json();
        const calendars = Array.isArray(data) ? data : (data.calendars || []);
        const allPeriods = calendars.flatMap((c: any) => c.periods || []).map((p: any) => ({
          id: p.id,
          periodName: p.periodName,
        }));
        setPeriods(allPeriods);
        if (allPeriods.length > 0) setUploadPeriodId(allPeriods[0].id);
      }

      if (plantsRes.ok) {
        const pData = await plantsRes.json();
        const plantList = Array.isArray(pData) ? pData : (pData.plants || []);
        setPlants(plantList);
      }
    } catch (err: any) {
      console.error('Failed to load actuals metadata:', err);
    }
  }

  async function loadBatches() {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (selectedPeriod) query.set('fiscalPeriodId', selectedPeriod);
      if (selectedPlant) query.set('plantId', selectedPlant);
      if (selectedStatus) query.set('status', selectedStatus);

      const res = await fetch(`/api/actuals/batches?${query.toString()}`);
      if (!res.ok) throw new Error('Failed to load actuals batches');
      const data = await res.json();
      setBatches(Array.isArray(data) ? data : (data.batches || []));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Multi-Step Upload Handler
  async function handleCreateAndProfile() {
    if (!batchName.trim() || !csvContent.trim() || !uploadPeriodId) {
      setError('Please provide batch name, fiscal period, and CSV file data.');
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      // 1. Profile CSV locally first
      const profRes = await fetch('/api/actuals/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileContent: csvContent, fileName }),
      });
      if (!profRes.ok) throw new Error('Failed to profile CSV content');
      const prof = await profRes.json();
      setProfilingData(prof);

      // 2. Upload Batch
      const upRes = await fetch('/api/actuals/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: batchName,
          importType,
          originalFileName: fileName,
          fileContent: csvContent,
          fiscalPeriodId: uploadPeriodId,
          plantId: uploadPlantId || undefined,
          controlTotal: controlTotal ? parseFloat(controlTotal) : undefined,
        }),
      });

      if (!upRes.ok) {
        const errJson = await upRes.json();
        throw new Error(errJson.error?.message || 'Failed to upload batch');
      }

      const newBatch = await upRes.json();
      setCreatedBatchId(newBatch.id);

      // Preset mappings
      if (newBatch.mappingConfig) {
        setMappingConfig(JSON.parse(newBatch.mappingConfig));
      }

      setUploadStep(2);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSaveMappingAndValidate() {
    if (!createdBatchId) return;
    setActionLoading(true);
    setError(null);

    try {
      // 1. Save Mappings
      const mapRes = await fetch(`/api/actuals/batches/${createdBatchId}/mapping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mappingConfig),
      });
      if (!mapRes.ok) throw new Error('Failed to save mapping profile');

      // 2. Validate Batch
      const valRes = await fetch(`/api/actuals/batches/${createdBatchId}/validate`, {
        method: 'POST',
      });
      if (!valRes.ok) throw new Error('Failed to validate batch records');

      setUploadStep(3);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCommitBatch() {
    if (!createdBatchId) return;
    setActionLoading(true);
    setError(null);

    try {
      const commitRes = await fetch(`/api/actuals/batches/${createdBatchId}/commit`, {
        method: 'POST',
      });
      if (!commitRes.ok) {
        const errJson = await commitRes.json();
        throw new Error(errJson.error?.message || 'Failed to commit import');
      }

      setIsUploadModalOpen(false);
      resetWizard();
      loadBatches();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  function resetWizard() {
    setUploadStep(1);
    setBatchName('');
    setCsvContent('');
    setControlTotal('');
    setCreatedBatchId(null);
    setProfilingData(null);
    setMappingConfig({});
  }

  // Lock Batch
  async function handleLockBatch(batchId: string) {
    if (!confirm('Are you sure you want to lock this actuals batch? Once locked, it cannot be modified.')) return;
    try {
      const res = await fetch(`/api/actuals/batches/${batchId}/lock`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to lock batch');
      loadBatches();
    } catch (err: any) {
      alert(err.message);
    }
  }

  // Reverse Batch
  async function handleConfirmReverse() {
    if (!reverseBatchId || !reversalReason.trim()) return;
    try {
      const res = await fetch(`/api/actuals/batches/${reverseBatchId}/reverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reversalReason }),
      });
      if (!res.ok) throw new Error('Failed to reverse batch');
      setReverseBatchId(null);
      setReversalReason('');
      loadBatches();
    } catch (err: any) {
      alert(err.message);
    }
  }

  // Open Reconciliation Drawer
  async function handleOpenRecon(batch: ActualBatch) {
    setActiveReconBatch(batch);
    setReconLoading(true);
    try {
      const res = await fetch(`/api/actuals/batches/${batch.id}/reconciliation`);
      if (res.ok) {
        const data = await res.json();
        setReconResults(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setReconLoading(false);
    }
  }

  // Open Rows Drawer
  async function handleOpenRows(batch: ActualBatch) {
    setActiveRowsBatch(batch);
    setRowsLoading(true);
    try {
      const res = await fetch(`/api/actuals/batches/${batch.id}/rows?limit=100`);
      if (res.ok) {
        const data = await res.json();
        setRowsList(data.rows || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRowsLoading(false);
    }
  }

  // Sample CSV generator for testing
  function handleLoadDemoRevenueCsv() {
    setBatchName('January 2027 Revenue Actuals - Chennai');
    setImportType('REVENUE_ACTUALS');
    setFileName('chennai_actuals_jan2027.csv');
    setControlTotal('520000');
    setCsvContent(`Transaction Date,Plant,Product,Account,Amount,Quantity,Description,External Ref
2027-01-15,PLANT-CH,SKU-PROD-A,4010,520000,1040,Standard Production Sales Batch A,INV-2027-001`);
  }

  function handleLoadDemoCogsOpexCsv() {
    setBatchName('January 2027 Manufacturing COGS & Opex Actuals');
    setImportType('GL_ACTUALS');
    setFileName('cogs_opex_actuals_jan2027.csv');
    setControlTotal('440000');
    setCsvContent(`Transaction Date,Plant,Product,Account,Amount,Quantity,Description,External Ref
2027-01-20,PLANT-CH,SKU-PROD-A,5010,198000,2200,Direct Steel Raw Material Consumption,MAT-ACT-001
2027-01-25,PLANT-CH,SKU-PROD-A,5020,110000,550,Robotic Line Direct Labor Incurred,LAB-ACT-001
2027-01-28,PLANT-CH,SKU-PROD-A,5030,22000,,Plant Utilities Electricity Expense,UTL-ACT-001
2027-01-31,PLANT-CH,,6010,40000,,General SG&A Operational Cost,OPX-SGA-001
2027-01-31,PLANT-CH,,6020,30000,,Research & Prototype Development,OPX-RND-001
2027-01-31,PLANT-CH,,6030,40000,,Freight & Distribution Logistics,OPX-DST-001`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Actuals Management & Reconciliation"
        description="Import, validate, reconcile, and lock historical actuals data for manufacturing variance analysis."
        actions={
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => setIsUploadModalOpen(true)}>
              <span className="flex items-center gap-1.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Upload Actuals Batch
              </span>
            </Button>
          </div>
        }
      />

      {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

      {/* Overview Metric Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Batches</span>
          <div className="mt-1 text-2xl font-bold text-slate-900">{batches.length}</div>
          <span className="text-xs text-slate-500 mt-1 block">Imported batches</span>
        </Card>
        <Card className="p-4">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Reconciled Batches</span>
          <div className="mt-1 text-2xl font-bold text-emerald-700">
            {batches.filter((b) => b.reconciliationStatus === 'RECONCILED').length}
          </div>
          <span className="text-xs text-emerald-600 mt-1 block">Passed validation</span>
        </Card>
        <Card className="p-4">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Locked Batches</span>
          <div className="mt-1 text-2xl font-bold text-blue-700">
            {(batches || []).filter((b) => b.status === 'LOCKED').length}
          </div>
          <span className="text-xs text-blue-600 mt-1 block">Locked for editing</span>
        </Card>
        <Card className="p-4">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Pending / Attention</span>
          <div className="mt-1 text-2xl font-bold text-amber-600">
            {(batches || []).filter((b) => b.reconciliationStatus === 'UNBALANCED' || b.status === 'UPLOADED').length}
          </div>
          <span className="text-xs text-amber-600 mt-1 block">Requires review</span>
        </Card>
      </div>

      {/* Filter Bar */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Select
            label="Fiscal Period"
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            options={[{ value: '', label: 'All Fiscal Periods' }, ...(periods || []).map((p) => ({ value: p.id, label: p.periodName }))]}
          />
          <Select
            label="Manufacturing Plant"
            value={selectedPlant}
            onChange={(e) => setSelectedPlant(e.target.value)}
            options={[{ value: '', label: 'All Plants' }, ...(plants || []).map((pl) => ({ value: pl.id, label: `${pl.code} - ${pl.name}` }))]}
          />
          <Select
            label="Status"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'UPLOADED', label: 'Uploaded' },
              { value: 'VALIDATED', label: 'Validated' },
              { value: 'IMPORTED', label: 'Imported' },
              { value: 'LOCKED', label: 'Locked' },
              { value: 'REVERSED', label: 'Reversed' },
            ]}
          />
          <div className="flex items-end">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                setSelectedPeriod('');
                setSelectedPlant('');
                setSelectedStatus('');
              }}
            >
              Reset Filters
            </Button>
          </div>
        </div>
      </Card>

      {/* Batches Table */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-sm font-semibold text-slate-800">Actuals Import Batches ({batches.length})</h2>
          <Button variant="ghost" size="sm" onClick={loadBatches}>
            Refresh
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Loading actuals import batches...</div>
        ) : batches.length === 0 ? (
          <div className="p-12 text-center">
            <EmptyState
              title="No actuals import batches found"
              description="Upload a CSV file containing actual financial or manufacturing operational transactions."
              actionLabel="Upload Actuals Batch"
              onAction={() => setIsUploadModalOpen(true)}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Batch Name / File</th>
                  <th className="px-4 py-3">Import Type</th>
                  <th className="px-4 py-3">Period & Plant</th>
                  <th className="px-4 py-3 text-right">Imported Total</th>
                  <th className="px-4 py-3 text-center">Rows</th>
                  <th className="px-4 py-3 text-center">Reconciliation</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batches.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{b.name}</div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">{b.originalFileName}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                        {b.importType.replace('_ACTUALS', '')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <div className="font-medium">{b.fiscalPeriod.periodName}</div>
                      <div className="text-slate-400">{b.plant ? b.plant.name : 'All Plants'}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-slate-900 tabular-nums">
                      {b.importedTotal !== null ? `${b.currency} ${b.importedTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                      {b.controlTotal !== null && (
                        <div className="text-[11px] text-slate-400">Ctrl: {b.currency} {b.controlTotal.toLocaleString()}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-xs">
                      <span className="text-emerald-700 font-semibold">{b.acceptedRowCount}</span>
                      {b.rejectedRowCount > 0 && <span className="text-rose-600 font-semibold"> / {b.rejectedRowCount} err</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        variant={
                          b.reconciliationStatus === 'RECONCILED'
                            ? 'success'
                            : b.reconciliationStatus === 'UNBALANCED'
                            ? 'danger'
                            : 'warning'
                        }
                      >
                        {b.reconciliationStatus}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        variant={
                          b.status === 'LOCKED'
                            ? 'primary'
                            : b.status === 'IMPORTED'
                            ? 'success'
                            : b.status === 'VALIDATED'
                            ? 'warning'
                            : b.status === 'REVERSED'
                            ? 'neutral'
                            : 'neutral'
                        }
                      >
                        {b.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => handleOpenRecon(b)}>
                        Recon
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleOpenRows(b)}>
                        Rows
                      </Button>
                      {['IMPORTED', 'PARTIALLY_IMPORTED'].includes(b.status) && (
                        <Button variant="secondary" size="sm" onClick={() => handleLockBatch(b.id)}>
                          Lock
                        </Button>
                      )}
                      {b.status !== 'REVERSED' && (
                        <Button variant="danger" size="sm" onClick={() => setReverseBatchId(b.id)}>
                          Reverse
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

      {/* Multi-Step Upload Modal */}
      {isUploadModalOpen && (
        <Modal
          isOpen={isUploadModalOpen}
          onClose={() => {
            setIsUploadModalOpen(false);
            resetWizard();
          }}
          title={`Upload Actuals - Step ${uploadStep} of 3`}
        >
          <div className="space-y-4">
            {uploadStep === 1 && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={handleLoadDemoRevenueCsv}>
                    Prefill Demo Revenue CSV
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleLoadDemoCogsOpexCsv}>
                    Prefill Demo COGS & Opex CSV
                  </Button>
                </div>

                <Input
                  label="Batch Name"
                  placeholder="e.g. January 2027 Factory Actuals"
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  required
                />

                <div className="grid grid-cols-2 gap-3">
                  <Select
                    label="Import Type"
                    value={importType}
                    onChange={(e) => setImportType(e.target.value)}
                    options={[
                      { value: 'REVENUE_ACTUALS', label: 'Revenue Actuals' },
                      { value: 'GL_ACTUALS', label: 'General Ledger / COGS / Opex' },
                      { value: 'PRODUCTION_ACTUALS', label: 'Production Units Actuals' },
                      { value: 'MATERIAL_ACTUALS', label: 'Material Consumption' },
                      { value: 'LABOR_ACTUALS', label: 'Labor Hours' },
                    ]}
                  />
                  <Select
                    label="Fiscal Period"
                    value={uploadPeriodId}
                    onChange={(e) => setUploadPeriodId(e.target.value)}
                    options={(periods || []).map((p) => ({ value: p.id, label: p.periodName }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Select
                    label="Plant (Optional)"
                    value={uploadPlantId}
                    onChange={(e) => setUploadPlantId(e.target.value)}
                    options={[{ value: '', label: 'All Plants' }, ...(plants || []).map((pl) => ({ value: pl.id, label: pl.name }))]}
                  />
                  <Input
                    label="Control Total (Optional)"
                    type="number"
                    placeholder="Expected total amount"
                    value={controlTotal}
                    onChange={(e) => setControlTotal(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    CSV Content (Paste RFC 4180 formatted text)
                  </label>
                  <textarea
                    className="w-full h-36 font-mono text-xs p-3 border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:outline-none bg-slate-50"
                    placeholder="Transaction Date,Plant,Product,Account,Amount,Quantity..."
                    value={csvContent}
                    onChange={(e) => setCsvContent(e.target.value)}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                  <Button variant="secondary" onClick={() => setIsUploadModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" disabled={actionLoading || !csvContent.trim()} onClick={handleCreateAndProfile}>
                    {actionLoading ? 'Profiling...' : 'Next: Column Mapping →'}
                  </Button>
                </div>
              </div>
            )}

            {uploadStep === 2 && profilingData && (
              <div className="space-y-4">
                <div className="bg-slate-50 p-3 rounded border border-slate-200 text-xs">
                  <div className="font-semibold text-slate-800">File Profile: {fileName}</div>
                  <div className="text-slate-500 mt-0.5">
                    Found {profilingData.rowCount} rows across {profilingData.columnNames.length} columns.
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Select
                    label="Transaction Date Column"
                    value={mappingConfig.dateColumn || ''}
                    onChange={(e) => setMappingConfig({ ...mappingConfig, dateColumn: e.target.value })}
                    options={[{ value: '', label: 'Select column' }, ...profilingData.columnNames.map((c) => ({ value: c, label: c }))]}
                  />
                  <Select
                    label="Amount Column"
                    value={mappingConfig.amountColumn || ''}
                    onChange={(e) => setMappingConfig({ ...mappingConfig, amountColumn: e.target.value })}
                    options={[{ value: '', label: 'Select column' }, ...profilingData.columnNames.map((c) => ({ value: c, label: c }))]}
                  />
                  <Select
                    label="Plant Column"
                    value={mappingConfig.plantColumn || ''}
                    onChange={(e) => setMappingConfig({ ...mappingConfig, plantColumn: e.target.value })}
                    options={[{ value: '', label: 'Select column' }, ...profilingData.columnNames.map((c) => ({ value: c, label: c }))]}
                  />
                  <Select
                    label="Product / SKU Column"
                    value={mappingConfig.productColumn || ''}
                    onChange={(e) => setMappingConfig({ ...mappingConfig, productColumn: e.target.value })}
                    options={[{ value: '', label: 'Select column' }, ...profilingData.columnNames.map((c) => ({ value: c, label: c }))]}
                  />
                  <Select
                    label="Account Column"
                    value={mappingConfig.accountColumn || ''}
                    onChange={(e) => setMappingConfig({ ...mappingConfig, accountColumn: e.target.value })}
                    options={[{ value: '', label: 'Select column' }, ...profilingData.columnNames.map((c) => ({ value: c, label: c }))]}
                  />
                  <Select
                    label="Quantity Column"
                    value={mappingConfig.quantityColumn || ''}
                    onChange={(e) => setMappingConfig({ ...mappingConfig, quantityColumn: e.target.value })}
                    options={[{ value: '', label: 'Select column' }, ...profilingData.columnNames.map((c) => ({ value: c, label: c }))]}
                  />
                </div>

                <div className="flex justify-between pt-2 border-t border-slate-200">
                  <Button variant="secondary" onClick={() => setUploadStep(1)}>
                    ← Back
                  </Button>
                  <Button variant="primary" disabled={actionLoading} onClick={handleSaveMappingAndValidate}>
                    {actionLoading ? 'Validating...' : 'Next: Review & Commit →'}
                  </Button>
                </div>
              </div>
            )}

            {uploadStep === 3 && (
              <div className="space-y-4">
                <Alert
                  type="success"
                  message="Batch successfully validated against master data and fiscal period dates."
                />

                <div className="bg-slate-50 p-4 rounded border border-slate-200 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Target Fiscal Period:</span>
                    <span className="font-semibold text-slate-800">
                      {(periods || []).find((p) => p.id === uploadPeriodId)?.periodName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Import Type:</span>
                    <span className="font-semibold text-slate-800">{importType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Total Rows Detected:</span>
                    <span className="font-semibold text-slate-800">{profilingData?.rowCount || 0}</span>
                  </div>
                  {controlTotal && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Control Total Declared:</span>
                      <span className="font-mono font-semibold text-slate-800">₹ {parseFloat(controlTotal).toLocaleString()}</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between pt-2 border-t border-slate-200">
                  <Button variant="secondary" onClick={() => setUploadStep(2)}>
                    ← Back
                  </Button>
                  <Button variant="primary" disabled={actionLoading} onClick={handleCommitBatch}>
                    {actionLoading ? 'Committing...' : 'Commit Import Transaction'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Reconciliation Drawer / Modal */}
      {activeReconBatch && (
        <Modal
          isOpen={!!activeReconBatch}
          onClose={() => setActiveReconBatch(null)}
          title={`Reconciliation Report: ${activeReconBatch.name}`}
        >
          <div className="space-y-4">
            <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200">
              <span className="text-slate-500">Batch ID: {activeReconBatch.id}</span>
              <Badge variant={activeReconBatch.reconciliationStatus === 'RECONCILED' ? 'success' : 'danger'}>
                {activeReconBatch.reconciliationStatus}
              </Badge>
            </div>

            {reconLoading ? (
              <div className="p-8 text-center text-slate-500 text-sm">Evaluating reconciliation rules...</div>
            ) : reconResults.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">No reconciliation tests executed yet.</div>
            ) : (
              <div className="space-y-2">
                {reconResults.map((r) => (
                  <div key={r.id} className="p-3 bg-slate-50 rounded border border-slate-200 text-xs">
                    <div className="flex justify-between items-center font-medium">
                      <span className="text-slate-800">{r.reconciliationType.replace(/_/g, ' ')}</span>
                      <Badge variant={r.status === 'BALANCED' ? 'success' : r.status === 'WARNING' ? 'warning' : 'danger'}>
                        {r.status}
                      </Badge>
                    </div>
                    <div className="text-slate-600 mt-1">{r.explanation}</div>
                    {r.suggestedResolution && (
                      <div className="text-amber-700 bg-amber-50 p-1.5 rounded mt-2 text-[11px]">
                        <strong>Resolution:</strong> {r.suggestedResolution}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-200">
              <Button variant="secondary" onClick={() => setActiveReconBatch(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Rows Inspector Drawer / Modal */}
      {activeRowsBatch && (
        <Modal
          isOpen={!!activeRowsBatch}
          onClose={() => setActiveRowsBatch(null)}
          title={`Source Rows Inspector: ${activeRowsBatch.name}`}
        >
          <div className="space-y-4 max-h-[70vh] overflow-y-auto">
            {rowsLoading ? (
              <div className="p-8 text-center text-slate-500 text-sm">Loading source row lineage...</div>
            ) : (
              <div className="space-y-2">
                {rowsList.map((r) => (
                  <div key={r.id} className="p-2.5 bg-slate-50 rounded border border-slate-200 text-xs font-mono">
                    <div className="flex justify-between items-center text-slate-600 mb-1">
                      <span>Row #{r.rowNumber}</span>
                      <Badge variant={r.validationStatus === 'VALID' ? 'success' : 'danger'}>
                        {r.validationStatus}
                      </Badge>
                    </div>
                    <pre className="text-[11px] text-slate-800 overflow-x-auto whitespace-pre-wrap">{r.rawPayload}</pre>
                    {r.errorMessages && (
                      <div className="text-rose-700 font-sans mt-1 text-[11px]">{r.errorMessages}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end pt-2 border-t border-slate-200">
              <Button variant="secondary" onClick={() => setActiveRowsBatch(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reversal Confirmation Modal */}
      {reverseBatchId && (
        <Modal
          isOpen={!!reverseBatchId}
          onClose={() => setReverseBatchId(null)}
          title="Reverse Actuals Batch"
        >
          <div className="space-y-4">
            <Alert
              type="error"
              message="Reversing will permanently remove all imported financial and operational records generated by this batch."
            />
            <Input
              label="Reversal Justification"
              placeholder="e.g. Duplicate upload from ERP system"
              value={reversalReason}
              onChange={(e) => setReversalReason(e.target.value)}
              required
            />
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <Button variant="secondary" onClick={() => setReverseBatchId(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={!reversalReason.trim()}
                onClick={handleConfirmReverse}
              >
                Confirm Reversal
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
