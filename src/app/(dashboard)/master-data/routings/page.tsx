'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SummaryMetric } from '@/components/ui/SummaryMetric';
import { Permissions, hasPermission, Role } from '@/core/domain/roles';

interface RoutingHeader {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  product: { id: string; code: string; name: string };
  plant: { id: string; code: string; name: string };
  versions: {
    id: string;
    versionNumber: number;
    status: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'ARCHIVED';
    effectiveFrom?: string | null;
    effectiveTo?: string | null;
    _count?: { operations: number };
    operations?: RoutingOperation[];
  }[];
}

interface RoutingOperation {
  id: string;
  sequence: number;
  operationName: string;
  workCenter: string;
  description?: string | null;
  setupTimeMinutes: number;
  runTimePerUnitMinutes: number;
  laborHoursPerUnit: number;
  machineHoursPerUnit: number;
}

interface ProductOption {
  id: string;
  code: string;
  name: string;
}

interface PlantOption {
  id: string;
  code: string;
  name: string;
}

interface CurrentUserContext {
  user: { id: string; email: string; name: string };
  organization: { id: string; name: string; slug: string } | null;
  membership: { id: string; role: Role } | null;
}

export default function RoutingsPage() {
  const [context, setContext] = useState<CurrentUserContext | null>(null);
  const [routings, setRoutings] = useState<RoutingHeader[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [plants, setPlants] = useState<PlantOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [selectedRouting, setSelectedRouting] = useState<RoutingHeader | null>(null);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createData, setCreateData] = useState({
    productId: '',
    plantId: '',
    name: 'Primary Manufacturing Routing',
    description: '',
  });

  const [isCreateVersionOpen, setIsCreateVersionOpen] = useState(false);
  const [versionData, setVersionData] = useState({
    versionNumber: 1,
    effectiveFrom: '',
    effectiveTo: '',
  });

  const [isAddOpOpen, setIsAddOpOpen] = useState(false);
  const [opData, setOpData] = useState({
    sequence: 10,
    operationName: '',
    workCenter: 'WC-ASSEMBLY-01',
    description: '',
    setupTimeMinutes: 15,
    runTimePerUnitMinutes: 2.5,
    laborHoursPerUnit: 0.25,
    machineHoursPerUnit: 0.15,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const canManage = context?.membership?.role
    ? hasPermission(context.membership.role, Permissions.MASTER_DATA_MANAGE)
    : false;

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const meRes = await fetch('/api/auth/me');
      if (!meRes.ok) throw new Error('Failed to load session');
      const meData = await meRes.json();
      setContext(meData);

      const [routRes, prodRes, plantRes] = await Promise.all([
        fetch('/api/master-data/routings'),
        fetch('/api/master-data/products'),
        fetch('/api/master-data/plants'),
      ]);

      if (!routRes.ok) throw new Error('Failed to load routings');
      const routData = await routRes.json();
      setRoutings(routData.routings);

      if (prodRes.ok) {
        const prodData = await prodRes.json();
        setProducts(prodData.products);
      }
      if (plantRes.ok) {
        const plantData = await plantRes.json();
        setPlants(plantData.plants);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading routings');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectRouting = async (routingId: string) => {
    try {
      const res = await fetch(`/api/master-data/routings/${routingId}`);
      if (!res.ok) throw new Error('Failed to load routing details');
      const data = await res.json();
      setSelectedRouting(data.routing);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error fetching routing');
    }
  };

  const handleCreateRouting = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setModalError(null);
    try {
      const res = await fetch('/api/master-data/routings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create routing');

      setIsCreateOpen(false);
      setSuccessMsg(`Routing "${createData.name}" created successfully.`);
      await loadData();
      selectRouting(data.routing.id);
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Error creating routing');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRouting) return;
    setIsSubmitting(true);
    setModalError(null);
    try {
      const res = await fetch(`/api/master-data/routings/${selectedRouting.id}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionNumber: Number(versionData.versionNumber),
          effectiveFrom: versionData.effectiveFrom ? new Date(versionData.effectiveFrom).toISOString() : null,
          effectiveTo: versionData.effectiveTo ? new Date(versionData.effectiveTo).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create version');

      setIsCreateVersionOpen(false);
      setSuccessMsg(`Version ${versionData.versionNumber} created.`);
      await selectRouting(selectedRouting.id);
      loadData();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Error creating version');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddOperation = async (e: React.FormEvent, versionId: string) => {
    e.preventDefault();
    if (!selectedRouting) return;
    setIsSubmitting(true);
    setModalError(null);
    try {
      const payload = {
        sequence: Number(opData.sequence),
        operationName: opData.operationName.trim(),
        workCenter: opData.workCenter.trim(),
        description: opData.description.trim() || null,
        setupTimeMinutes: Number(opData.setupTimeMinutes) || 0,
        runTimePerUnitMinutes: Number(opData.runTimePerUnitMinutes) || 0,
        laborHoursPerUnit: Number(opData.laborHoursPerUnit) || 0,
        machineHoursPerUnit: Number(opData.machineHoursPerUnit) || 0,
      };

      const res = await fetch(`/api/master-data/routings/${selectedRouting.id}/versions/${versionId}/operations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add operation');

      setIsAddOpOpen(false);
      setSuccessMsg(`Operation seq ${opData.sequence} added.`);
      selectRouting(selectedRouting.id);
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Error adding operation');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveOperation = async (versionId: string, opId: string) => {
    if (!selectedRouting) return;
    if (!window.confirm('Are you sure you want to remove this operation?')) return;
    try {
      const res = await fetch(`/api/master-data/routings/${selectedRouting.id}/versions/${versionId}/operations/${opId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove operation');

      setSuccessMsg('Operation removed.');
      selectRouting(selectedRouting.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error removing operation');
    }
  };

  const handleUpdateStatus = async (versionId: string, status: string) => {
    if (!selectedRouting) return;
    try {
      const res = await fetch(`/api/master-data/routings/${selectedRouting.id}/versions/${versionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update routing version status');

      setSuccessMsg(`Routing version marked as ${status}.`);
      await selectRouting(selectedRouting.id);
      loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error updating version status');
    }
  };

  const handleDeleteRouting = async (routing: RoutingHeader) => {
    if (!window.confirm(`Are you sure you want to delete routing "${routing.name}"?`)) return;
    try {
      const res = await fetch(`/api/master-data/routings/${routing.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete routing');

      setSuccessMsg(`Routing "${routing.name}" deleted.`);
      if (selectedRouting?.id === routing.id) setSelectedRouting(null);
      loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete routing');
    }
  };

  const getStatusVariant = (s: string) => {
    switch (s) {
      case 'APPROVED': return 'success';
      case 'IN_REVIEW': return 'warning';
      case 'DRAFT': return 'neutral';
      case 'ARCHIVED': return 'neutral';
      default: return 'neutral';
    }
  };

  const approvedRoutings = routings.filter((r) => r.versions.some((v) => v.status === 'APPROVED')).length;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 48 }}>
      <PageHeader
        title="Production Routings"
        description="Define manufacturing step sequences, work centers, labor hours, and machine run times."
        action={
          canManage && (
            <Button
              variant="primary"
              onClick={() => {
                setCreateData({
                  productId: products[0]?.id || '',
                  plantId: plants[0]?.id || '',
                  name: 'Standard Production Routing',
                  description: '',
                });
                setModalError(null);
                setIsCreateOpen(true);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Create Routing
            </Button>
          )
        }
      />

      {successMsg && (
        <Alert variant="success" onClose={() => setSuccessMsg(null)} style={{ marginBottom: 20 }}>
          {successMsg}
        </Alert>
      )}

      {error && (
        <Alert variant="danger" onClose={() => setError(null)} style={{ marginBottom: 20 }}>
          {error}
        </Alert>
      )}

      {/* Summary Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        <SummaryMetric
          label="Total Routings"
          value={routings.length}
          helperText="Plant operation sequences"
        />
        <SummaryMetric
          label="Approved Routings"
          value={approvedRoutings}
          helperText="Active for cost calculation"
        />
        <SummaryMetric
          label="Linked Facilities"
          value={plants.length}
          helperText="Work center locations"
        />
        <SummaryMetric
          label="Catalog Products"
          value={products.length}
          helperText="Applicable finished goods"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedRouting ? '1fr 1.2fr' : '1fr', gap: 24, alignItems: 'start' }}>
        {/* Left Column: Routing Headers List */}
        <Card>
          <CardHeader>
            <CardTitle>Manufacturing Routings</CardTitle>
            <CardDescription>Select a routing to review work centers, sequences, and cycle times</CardDescription>
          </CardHeader>
          <CardContent style={{ padding: 0 }}>
            {isLoading ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
                Loading routings...
              </div>
            ) : routings.length === 0 ? (
              <EmptyState
                title="No routings configured"
                description="Create a production routing to define sequences and labor cycle hours."
                action={
                  canManage ? (
                    <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
                      Create Routing
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid var(--border-default)' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Product</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Facility</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Routing Name</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {routings.map((r) => {
                    const latestVer = r.versions[0];
                    const isSelected = selectedRouting?.id === r.id;
                    return (
                      <tr
                        key={r.id}
                        onClick={() => selectRouting(r.id)}
                        style={{
                          borderBottom: '1px solid var(--border-default)',
                          cursor: 'pointer',
                          backgroundColor: isSelected ? '#EFF6FF' : 'transparent',
                          transition: 'background-color 0.15s',
                        }}
                      >
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>{r.product.code}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{r.product.name}</div>
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                          {r.plant.code}
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 500 }}>
                          {r.name}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {latestVer ? (
                            <Badge variant={getStatusVariant(latestVer.status)}>
                              v{latestVer.versionNumber} {latestVer.status}
                            </Badge>
                          ) : (
                            <span style={{ color: 'var(--text-secondary)' }}>None</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteRouting(r);
                            }}
                            style={{ color: 'var(--color-danger)' }}
                          >
                            Delete
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Right Column: Operations Detail for Selected Routing */}
        {selectedRouting && (
          <div>
            {selectedRouting.versions.map((ver) => (
              <Card key={ver.id} style={{ marginBottom: 16 }}>
                <CardHeader>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CardTitle>Version {ver.versionNumber}</CardTitle>
                        <Badge variant={getStatusVariant(ver.status)}>
                          {ver.status}
                        </Badge>
                      </div>
                      <CardDescription>
                        Plant: {selectedRouting.plant.code} · Product: {selectedRouting.product.code}
                      </CardDescription>
                    </div>

                    {canManage && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        {ver.status === 'DRAFT' && (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                const lastSeq = ver.operations && ver.operations.length > 0
                                  ? Math.max(...ver.operations.map((o) => o.sequence)) + 10
                                  : 10;
                                setOpData({
                                  sequence: lastSeq,
                                  operationName: '',
                                  workCenter: 'WC-ASSEMBLY-01',
                                  description: '',
                                  setupTimeMinutes: 10,
                                  runTimePerUnitMinutes: 2,
                                  laborHoursPerUnit: 0.2,
                                  machineHoursPerUnit: 0.1,
                                });
                                setModalError(null);
                                setIsAddOpOpen(true);
                              }}
                            >
                              + Operation
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleUpdateStatus(ver.id, 'IN_REVIEW')}
                            >
                              Submit Review
                            </Button>
                          </>
                        )}
                        {ver.status === 'IN_REVIEW' && (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleUpdateStatus(ver.id, 'DRAFT')}
                            >
                              Return Draft
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleUpdateStatus(ver.id, 'APPROVED')}
                            >
                              Approve Routing
                            </Button>
                          </>
                        )}
                        {ver.status === 'APPROVED' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleUpdateStatus(ver.id, 'ARCHIVED')}
                          >
                            Archive
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent style={{ padding: 0 }}>
                  {!ver.operations || ver.operations.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>
                      No sequence operations configured yet.
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid var(--border-default)' }}>
                          <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)' }}>Seq</th>
                          <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)' }}>Operation</th>
                          <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)' }}>Work Center</th>
                          <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Run Min</th>
                          <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Labor Hrs</th>
                          {ver.status === 'DRAFT' && canManage && (
                            <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Action</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {ver.operations.map((op) => (
                          <tr key={op.id} style={{ borderBottom: '1px solid var(--border-default)' }}>
                            <td style={{ padding: '10px 14px', fontWeight: 600, fontFamily: 'monospace' }}>
                              {op.sequence}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <div style={{ fontWeight: 500 }}>{op.operationName}</div>
                              {op.description && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{op.description}</div>
                              )}
                            </td>
                            <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                              {op.workCenter}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace' }}>
                              {op.runTimePerUnitMinutes} min
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                              {op.laborHoursPerUnit} hrs
                            </td>
                            {ver.status === 'DRAFT' && canManage && (
                              <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveOperation(ver.id, op.id)}
                                  style={{ color: 'var(--color-danger)' }}
                                >
                                  Remove
                                </Button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            ))}

            {canManage && (
              <Button
                variant="secondary"
                style={{ width: '100%', borderStyle: 'dashed' }}
                onClick={() => {
                  const nextNum = (selectedRouting.versions[0]?.versionNumber || 0) + 1;
                  setVersionData({ versionNumber: nextNum, effectiveFrom: '', effectiveTo: '' });
                  setIsCreateVersionOpen(true);
                }}
              >
                + Create New Routing Version
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Create Routing Modal */}
      {isCreateOpen && (
        <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create Routing Header">
          <form onSubmit={handleCreateRouting}>
            {modalError && <Alert variant="danger" style={{ marginBottom: 16 }}>{modalError}</Alert>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 4 }}>
                  Product SKU
                </label>
                <select
                  required
                  value={createData.productId}
                  onChange={(e) => setCreateData({ ...createData, productId: e.target.value })}
                  style={{
                    width: '100%',
                    height: 38,
                    padding: '0 10px',
                    borderRadius: 6,
                    border: '1px solid var(--border-default)',
                    fontSize: '0.875rem',
                    backgroundColor: '#FFFFFF',
                  }}
                >
                  <option value="">Select product...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 4 }}>
                  Manufacturing Facility
                </label>
                <select
                  required
                  value={createData.plantId}
                  onChange={(e) => setCreateData({ ...createData, plantId: e.target.value })}
                  style={{
                    width: '100%',
                    height: 38,
                    padding: '0 10px',
                    borderRadius: 6,
                    border: '1px solid var(--border-default)',
                    fontSize: '0.875rem',
                    backgroundColor: '#FFFFFF',
                  }}
                >
                  <option value="">Select facility...</option>
                  {plants.map((p) => (
                    <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <Input
                label="Routing Name"
                required
                value={createData.name}
                onChange={(e) => setCreateData({ ...createData, name: e.target.value })}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <Input
                label="Description"
                placeholder="Optional engineering notes"
                value={createData.description}
                onChange={(e) => setCreateData({ ...createData, description: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Routing'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Create Version Modal */}
      {isCreateVersionOpen && selectedRouting && (
        <Modal isOpen={isCreateVersionOpen} onClose={() => setIsCreateVersionOpen(false)} title={`New Version for ${selectedRouting.name}`}>
          <form onSubmit={handleCreateVersion}>
            {modalError && <Alert variant="danger" style={{ marginBottom: 16 }}>{modalError}</Alert>}
            <div style={{ marginBottom: 12 }}>
              <Input
                label="Version Number"
                type="number"
                min={1}
                required
                value={versionData.versionNumber}
                onChange={(e) => setVersionData({ ...versionData, versionNumber: Number(e.target.value) })}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <Input
                label="Effective From"
                type="date"
                value={versionData.effectiveFrom}
                onChange={(e) => setVersionData({ ...versionData, effectiveFrom: e.target.value })}
              />
              <Input
                label="Effective To"
                type="date"
                value={versionData.effectiveTo}
                onChange={(e) => setVersionData({ ...versionData, effectiveTo: e.target.value })}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button type="button" variant="secondary" onClick={() => setIsCreateVersionOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Version'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add Operation Modal */}
      {isAddOpOpen && selectedRouting && (
        <Modal isOpen={isAddOpOpen} onClose={() => setIsAddOpOpen(false)} title="Add Operation Step">
          <form onSubmit={(e) => handleAddOperation(e, selectedRouting.versions[0]?.id)}>
            {modalError && <Alert variant="danger" style={{ marginBottom: 16 }}>{modalError}</Alert>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }}>
              <Input
                label="Sequence #"
                type="number"
                min={1}
                step={1}
                required
                value={opData.sequence}
                onChange={(e) => setOpData({ ...opData, sequence: Number(e.target.value) })}
              />
              <Input
                label="Operation Name"
                placeholder="e.g. Surface Mounting (SMT)"
                required
                value={opData.operationName}
                onChange={(e) => setOpData({ ...opData, operationName: e.target.value })}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <Input
                label="Work Center"
                placeholder="e.g. WC-SMT-01"
                required
                value={opData.workCenter}
                onChange={(e) => setOpData({ ...opData, workCenter: e.target.value })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <Input
                label="Setup Time (Minutes)"
                type="number"
                min={0}
                step={0.1}
                value={opData.setupTimeMinutes}
                onChange={(e) => setOpData({ ...opData, setupTimeMinutes: parseFloat(e.target.value) || 0 })}
              />
              <Input
                label="Run Time per Unit (Minutes)"
                type="number"
                min={0}
                step={0.1}
                value={opData.runTimePerUnitMinutes}
                onChange={(e) => setOpData({ ...opData, runTimePerUnitMinutes: parseFloat(e.target.value) || 0 })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <Input
                label="Labor Hours per Unit"
                type="number"
                min={0}
                step={0.01}
                value={opData.laborHoursPerUnit}
                onChange={(e) => setOpData({ ...opData, laborHoursPerUnit: parseFloat(e.target.value) || 0 })}
              />
              <Input
                label="Machine Hours per Unit"
                type="number"
                min={0}
                step={0.01}
                value={opData.machineHoursPerUnit}
                onChange={(e) => setOpData({ ...opData, machineHoursPerUnit: parseFloat(e.target.value) || 0 })}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button type="button" variant="secondary" onClick={() => setIsAddOpOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? 'Adding...' : 'Add Operation'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
