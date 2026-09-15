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

interface BomHeader {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  product: {
    id: string;
    code: string;
    name: string;
    unitOfMeasure: string;
  };
  versions: {
    id: string;
    versionNumber: number;
    status: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'ARCHIVED';
    effectiveFrom?: string | null;
    effectiveTo?: string | null;
    _count?: { lines: number };
    lines?: BomLine[];
  }[];
}

interface BomLine {
  id: string;
  componentType: 'MATERIAL' | 'PRODUCT';
  quantityPerUnit: number;
  unitOfMeasure: string;
  scrapPercentage: number;
  material?: { id: string; code: string; name: string } | null;
  componentProduct?: { id: string; code: string; name: string } | null;
}

interface ProductOption {
  id: string;
  code: string;
  name: string;
  unitOfMeasure: string;
}

interface MaterialOption {
  id: string;
  code: string;
  name: string;
  unitOfMeasure: string;
}

interface CurrentUserContext {
  user: { id: string; email: string; name: string };
  organization: { id: string; name: string; slug: string } | null;
  membership: { id: string; role: Role } | null;
}

export default function BomsPage() {
  const [context, setContext] = useState<CurrentUserContext | null>(null);
  const [boms, setBoms] = useState<BomHeader[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Selected BOM for drilldown
  const [selectedBom, setSelectedBom] = useState<BomHeader | null>(null);

  // Modals
  const [isCreateBomOpen, setIsCreateBomOpen] = useState(false);
  const [createBomData, setCreateBomData] = useState({
    productId: '',
    name: 'Primary Production BOM',
    description: '',
  });

  const [isCreateVersionOpen, setIsCreateVersionOpen] = useState(false);
  const [versionData, setVersionData] = useState({
    versionNumber: 1,
    effectiveFrom: '',
    effectiveTo: '',
  });

  const [isAddLineOpen, setIsAddLineOpen] = useState(false);
  const [lineData, setLineData] = useState({
    componentType: 'MATERIAL' as 'MATERIAL' | 'PRODUCT',
    materialId: '',
    componentProductId: '',
    quantityPerUnit: 1,
    unitOfMeasure: 'EA',
    scrapPercentage: 0,
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

      const [bomRes, prodRes, matRes] = await Promise.all([
        fetch('/api/master-data/boms'),
        fetch('/api/master-data/products'),
        fetch('/api/master-data/materials'),
      ]);

      if (!bomRes.ok) throw new Error('Failed to load BOMs');
      const bomData = await bomRes.json();
      setBoms(bomData.boms);

      if (prodRes.ok) {
        const prodData = await prodRes.json();
        setProducts(prodData.products);
      }
      if (matRes.ok) {
        const matData = await matRes.json();
        setMaterials(matData.materials);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred loading BOMs');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load detailed single BOM when selected
  const selectBom = async (bomId: string) => {
    try {
      const res = await fetch(`/api/master-data/boms/${bomId}`);
      if (!res.ok) throw new Error('Failed to load BOM details');
      const data = await res.json();
      setSelectedBom(data.bom);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error fetching BOM');
    }
  };

  const handleCreateBom = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setModalError(null);
    try {
      const res = await fetch('/api/master-data/boms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createBomData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create BOM');

      setIsCreateBomOpen(false);
      setSuccessMsg(`BOM "${createBomData.name}" created successfully.`);
      await loadData();
      selectBom(data.bom.id);
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Error creating BOM');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBom) return;
    setIsSubmitting(true);
    setModalError(null);
    try {
      const res = await fetch(`/api/master-data/boms/${selectedBom.id}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionNumber: Number(versionData.versionNumber),
          effectiveFrom: versionData.effectiveFrom ? new Date(versionData.effectiveFrom).toISOString() : null,
          effectiveTo: versionData.effectiveTo ? new Date(versionData.effectiveTo).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create BOM version');

      setIsCreateVersionOpen(false);
      setSuccessMsg(`Version ${versionData.versionNumber} created.`);
      await selectBom(selectedBom.id);
      loadData();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Error creating version');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddLine = async (e: React.FormEvent, versionId: string) => {
    e.preventDefault();
    if (!selectedBom) return;
    setIsSubmitting(true);
    setModalError(null);
    try {
      const payload: any = {
        componentType: lineData.componentType,
        quantityPerUnit: Number(lineData.quantityPerUnit),
        unitOfMeasure: lineData.unitOfMeasure.toUpperCase(),
        scrapPercentage: Number(lineData.scrapPercentage) || 0,
      };

      if (lineData.componentType === 'MATERIAL') {
        payload.materialId = lineData.materialId;
      } else {
        payload.componentProductId = lineData.componentProductId;
      }

      const res = await fetch(`/api/master-data/boms/${selectedBom.id}/versions/${versionId}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add BOM component line');

      setIsAddLineOpen(false);
      setSuccessMsg('Component added to BOM successfully.');
      selectBom(selectedBom.id);
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Error adding component');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveLine = async (versionId: string, lineId: string) => {
    if (!selectedBom) return;
    if (!window.confirm('Are you sure you want to remove this component line?')) return;
    try {
      const res = await fetch(`/api/master-data/boms/${selectedBom.id}/versions/${versionId}/lines/${lineId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove component line');

      setSuccessMsg('Component line removed.');
      selectBom(selectedBom.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error removing line');
    }
  };

  const handleUpdateStatus = async (versionId: string, status: string) => {
    if (!selectedBom) return;
    try {
      const res = await fetch(`/api/master-data/boms/${selectedBom.id}/versions/${versionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update BOM version status');

      setSuccessMsg(`BOM version marked as ${status}.`);
      await selectBom(selectedBom.id);
      loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error updating version status');
    }
  };

  const handleDeleteBom = async (bom: BomHeader) => {
    if (!window.confirm(`Are you sure you want to delete BOM "${bom.name}"?`)) return;
    try {
      const res = await fetch(`/api/master-data/boms/${bom.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete BOM');

      setSuccessMsg(`BOM "${bom.name}" deleted.`);
      if (selectedBom?.id === bom.id) setSelectedBom(null);
      loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete BOM');
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

  const approvedBoms = boms.filter((b) => b.versions.some((v) => v.status === 'APPROVED')).length;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 48 }}>
      <PageHeader
        title="Bills of Materials"
        description="Manage product structures, component ratios, scrap factors, and version approvals."
        action={
          canManage && (
            <Button variant="primary" onClick={() => {
              setCreateBomData({ productId: products[0]?.id || '', name: 'Standard BOM', description: '' });
              setModalError(null);
              setIsCreateBomOpen(true);
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Create BOM
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
          label="Total BOMs"
          value={boms.length}
          helperText="Configured bills of materials"
        />
        <SummaryMetric
          label="Approved BOMs"
          value={approvedBoms}
          helperText="Active for cost rollups"
        />
        <SummaryMetric
          label="Available Raw Materials"
          value={materials.length}
          helperText="Input components"
        />
        <SummaryMetric
          label="Catalog SKUs"
          value={products.length}
          helperText="Finished/subassemblies"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedBom ? '1fr 1.2fr' : '1fr', gap: 24, alignItems: 'start' }}>
        {/* Left Column: BOM Headers List */}
        <Card>
          <CardHeader>
            <CardTitle>Bills of Materials</CardTitle>
            <CardDescription>Select a BOM to inspect version lines or change lifecycle status</CardDescription>
          </CardHeader>
          <CardContent style={{ padding: 0 }}>
            {isLoading ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
                Loading BOM structures...
              </div>
            ) : boms.length === 0 ? (
              <EmptyState
                title="No BOMs configured"
                description="Create a Bill of Materials for your finished goods to enable costing."
                action={
                  canManage ? (
                    <Button variant="primary" onClick={() => setIsCreateBomOpen(true)}>
                      Create BOM
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid var(--border-default)' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Target Product</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>BOM Name</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Latest Ver</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {boms.map((bom) => {
                    const latestVer = bom.versions[0];
                    const isSelected = selectedBom?.id === bom.id;
                    return (
                      <tr
                        key={bom.id}
                        onClick={() => selectBom(bom.id)}
                        style={{
                          borderBottom: '1px solid var(--border-default)',
                          cursor: 'pointer',
                          backgroundColor: isSelected ? '#EFF6FF' : 'transparent',
                          transition: 'background-color 0.15s',
                        }}
                      >
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>{bom.product.code}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{bom.product.name}</div>
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 500 }}>
                          {bom.name}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {latestVer ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontWeight: 600 }}>v{latestVer.versionNumber}</span>
                              <Badge variant={getStatusVariant(latestVer.status)}>
                                {latestVer.status}
                              </Badge>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-secondary)' }}>No version</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteBom(bom);
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

        {/* Right Column: Selected BOM Details & Line Items */}
        {selectedBom && (
          <div>
            {selectedBom.versions.map((ver) => (
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
                        Product: {selectedBom.product.code} ({selectedBom.product.name})
                      </CardDescription>
                    </div>

                    {/* Version status workflow buttons */}
                    {canManage && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        {ver.status === 'DRAFT' && (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setLineData({
                                  componentType: 'MATERIAL',
                                  materialId: materials[0]?.id || '',
                                  componentProductId: '',
                                  quantityPerUnit: 1,
                                  unitOfMeasure: 'EA',
                                  scrapPercentage: 0,
                                });
                                setModalError(null);
                                setIsAddLineOpen(true);
                              }}
                            >
                              + Component
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
                              Approve BOM
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
                  {!ver.lines || ver.lines.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>
                      No components added yet to Version {ver.versionNumber}.
                      {ver.status === 'DRAFT' && canManage && (
                        <div style={{ marginTop: 12 }}>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setLineData({
                                componentType: 'MATERIAL',
                                materialId: materials[0]?.id || '',
                                componentProductId: '',
                                quantityPerUnit: 1,
                                unitOfMeasure: 'EA',
                                scrapPercentage: 0,
                              });
                              setIsAddLineOpen(true);
                            }}
                          >
                            Add First Component
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid var(--border-default)' }}>
                          <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)' }}>Type</th>
                          <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)' }}>Component</th>
                          <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Qty / Unit</th>
                          <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Scrap %</th>
                          {ver.status === 'DRAFT' && canManage && (
                            <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Action</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {ver.lines.map((line) => (
                          <tr key={line.id} style={{ borderBottom: '1px solid var(--border-default)' }}>
                            <td style={{ padding: '10px 14px' }}>
                              <span style={{
                                fontSize: '0.75rem',
                                padding: '2px 6px',
                                borderRadius: 4,
                                backgroundColor: line.componentType === 'MATERIAL' ? '#F1F5F9' : '#EDE9FE',
                                color: line.componentType === 'MATERIAL' ? '#334155' : '#6D28D9',
                                fontWeight: 500,
                              }}>
                                {line.componentType === 'MATERIAL' ? 'Material' : 'Subassembly'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              {line.componentType === 'MATERIAL' ? (
                                <div>
                                  <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{line.material?.code}</span>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{line.material?.name}</div>
                                </div>
                              ) : (
                                <div>
                                  <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{line.componentProduct?.code}</span>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{line.componentProduct?.name}</div>
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, fontFamily: 'monospace' }}>
                              {line.quantityPerUnit} {line.unitOfMeasure}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                              {line.scrapPercentage > 0 ? `${line.scrapPercentage}%` : '0%'}
                            </td>
                            {ver.status === 'DRAFT' && canManage && (
                              <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveLine(ver.id, line.id)}
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
                  const nextNum = (selectedBom.versions[0]?.versionNumber || 0) + 1;
                  setVersionData({ versionNumber: nextNum, effectiveFrom: '', effectiveTo: '' });
                  setIsCreateVersionOpen(true);
                }}
              >
                + Create New BOM Version
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Create BOM Modal */}
      {isCreateBomOpen && (
        <Modal isOpen={isCreateBomOpen} onClose={() => setIsCreateBomOpen(false)} title="Create Bill of Materials (BOM)">
          <form onSubmit={handleCreateBom}>
            {modalError && <Alert variant="danger" style={{ marginBottom: 16 }}>{modalError}</Alert>}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 4 }}>
                Parent Finished Good or Assembly
              </label>
              <select
                required
                value={createBomData.productId}
                onChange={(e) => setCreateBomData({ ...createBomData, productId: e.target.value })}
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
                <option value="">Select target product...</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <Input
                label="BOM Name"
                required
                value={createBomData.name}
                onChange={(e) => setCreateBomData({ ...createBomData, name: e.target.value })}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <Input
                label="Description"
                placeholder="Optional engineering notes"
                value={createBomData.description}
                onChange={(e) => setCreateBomData({ ...createBomData, description: e.target.value })}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button type="button" variant="secondary" onClick={() => setIsCreateBomOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create BOM'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Create Version Modal */}
      {isCreateVersionOpen && selectedBom && (
        <Modal isOpen={isCreateVersionOpen} onClose={() => setIsCreateVersionOpen(false)} title={`New Version for ${selectedBom.name}`}>
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

      {/* Add Component Line Modal */}
      {isAddLineOpen && selectedBom && (
        <Modal isOpen={isAddLineOpen} onClose={() => setIsAddLineOpen(false)} title="Add BOM Component">
          <form onSubmit={(e) => handleAddLine(e, selectedBom.versions[0]?.id)}>
            {modalError && <Alert variant="danger" style={{ marginBottom: 16 }}>{modalError}</Alert>}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 4 }}>
                Component Type
              </label>
              <div style={{ display: 'flex', gap: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="compType"
                    checked={lineData.componentType === 'MATERIAL'}
                    onChange={() => setLineData({ ...lineData, componentType: 'MATERIAL', materialId: materials[0]?.id || '' })}
                  />
                  Raw Material
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="compType"
                    checked={lineData.componentType === 'PRODUCT'}
                    onChange={() => setLineData({ ...lineData, componentType: 'PRODUCT', componentProductId: products[0]?.id || '' })}
                  />
                  Subassembly (Product)
                </label>
              </div>
            </div>

            {lineData.componentType === 'MATERIAL' ? (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 4 }}>
                  Select Material
                </label>
                <select
                  required
                  value={lineData.materialId}
                  onChange={(e) => {
                    const m = materials.find((item) => item.id === e.target.value);
                    setLineData({ ...lineData, materialId: e.target.value, unitOfMeasure: m?.unitOfMeasure || 'EA' });
                  }}
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
                  <option value="">Select material...</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>{m.code} - {m.name} ({m.unitOfMeasure})</option>
                  ))}
                </select>
              </div>
            ) : (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 4 }}>
                  Select Subassembly
                </label>
                <select
                  required
                  value={lineData.componentProductId}
                  onChange={(e) => {
                    const p = products.find((item) => item.id === e.target.value);
                    setLineData({ ...lineData, componentProductId: e.target.value, unitOfMeasure: p?.unitOfMeasure || 'EA' });
                  }}
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
                  {products.filter((p) => p.id !== selectedBom.product.id).map((p) => (
                    <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
              <Input
                label="Qty per Parent Unit"
                type="number"
                step="0.001"
                min="0.001"
                required
                value={lineData.quantityPerUnit}
                onChange={(e) => setLineData({ ...lineData, quantityPerUnit: parseFloat(e.target.value) || 0 })}
              />
              <Input
                label="Unit of Measure"
                required
                value={lineData.unitOfMeasure}
                onChange={(e) => setLineData({ ...lineData, unitOfMeasure: e.target.value.toUpperCase() })}
              />
              <Input
                label="Scrap % (0-100)"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={lineData.scrapPercentage}
                onChange={(e) => setLineData({ ...lineData, scrapPercentage: parseFloat(e.target.value) || 0 })}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button type="button" variant="secondary" onClick={() => setIsAddLineOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? 'Adding...' : 'Add Component'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
