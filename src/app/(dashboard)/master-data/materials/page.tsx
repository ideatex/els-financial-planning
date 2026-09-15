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

interface Material {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  category: string;
  unitOfMeasure: string;
  defaultCostCents: number;
  currency: string;
  supplierReference?: string | null;
  leadTimeDays: number;
  isActive: boolean;
  _count?: {
    bomLines: number;
  };
}

interface CurrentUserContext {
  user: { id: string; email: string; name: string };
  organization: { id: string; name: string; slug: string } | null;
  membership: { id: string; role: Role } | null;
}

export default function MaterialsPage() {
  const [context, setContext] = useState<CurrentUserContext | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    category: 'Raw Materials',
    unitOfMeasure: 'KG',
    costDollars: '5.00',
    currency: 'USD',
    supplierReference: '',
    leadTimeDays: 7,
    isActive: true,
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

      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (statusFilter === 'ACTIVE') params.set('isActive', 'true');
      if (statusFilter === 'INACTIVE') params.set('isActive', 'false');

      const res = await fetch(`/api/master-data/materials?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load materials');
      const data = await res.json();
      setMaterials(data.materials);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred loading materials');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenCreate = () => {
    setFormData({
      code: '',
      name: '',
      description: '',
      category: 'Raw Materials',
      unitOfMeasure: 'KG',
      costDollars: '10.00',
      currency: 'USD',
      supplierReference: '',
      leadTimeDays: 14,
      isActive: true,
    });
    setModalError(null);
    setIsCreateOpen(true);
  };

  const handleOpenEdit = (m: Material) => {
    setEditingMaterial(m);
    setFormData({
      code: m.code,
      name: m.name,
      description: m.description || '',
      category: m.category,
      unitOfMeasure: m.unitOfMeasure,
      costDollars: (m.defaultCostCents / 100).toFixed(2),
      currency: m.currency,
      supplierReference: m.supplierReference || '',
      leadTimeDays: m.leadTimeDays,
      isActive: m.isActive,
    });
    setModalError(null);
  };

  const handleSubmitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setModalError(null);
    try {
      const defaultCostCents = Math.round(parseFloat(formData.costDollars || '0') * 100);
      if (isNaN(defaultCostCents) || defaultCostCents < 0) {
        throw new Error('Default cost must be a valid non-negative number');
      }

      const payload = {
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        category: formData.category.trim(),
        unitOfMeasure: formData.unitOfMeasure.trim().toUpperCase(),
        defaultCostCents,
        currency: formData.currency,
        supplierReference: formData.supplierReference.trim() || null,
        leadTimeDays: Number(formData.leadTimeDays) || 0,
        isActive: formData.isActive,
      };

      const res = await fetch('/api/master-data/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create material');

      setIsCreateOpen(false);
      setSuccessMsg(`Material "${formData.name}" (${formData.code}) created successfully.`);
      loadData();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Error creating material');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMaterial) return;
    setIsSubmitting(true);
    setModalError(null);
    try {
      const defaultCostCents = Math.round(parseFloat(formData.costDollars || '0') * 100);
      if (isNaN(defaultCostCents) || defaultCostCents < 0) {
        throw new Error('Default cost must be a valid non-negative number');
      }

      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        category: formData.category.trim(),
        unitOfMeasure: formData.unitOfMeasure.trim().toUpperCase(),
        defaultCostCents,
        currency: formData.currency,
        supplierReference: formData.supplierReference.trim() || null,
        leadTimeDays: Number(formData.leadTimeDays) || 0,
        isActive: formData.isActive,
      };

      const res = await fetch(`/api/master-data/materials/${editingMaterial.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update material');

      setEditingMaterial(null);
      setSuccessMsg(`Material "${formData.name}" updated successfully.`);
      loadData();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Error updating material');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (m: Material) => {
    if (!window.confirm(`Are you sure you want to delete material ${m.code} (${m.name})?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/master-data/materials/${m.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete material');

      setSuccessMsg(`Material ${m.code} deleted.`);
      loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete material');
    }
  };

  const formatMoney = (cents: number, cur: string) => {
    return (cents / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: cur || 'USD',
    });
  };

  const activeMaterials = materials.filter((m) => m.isActive).length;
  const avgCostCents = materials.length > 0
    ? Math.round(materials.reduce((acc, m) => acc + m.defaultCostCents, 0) / materials.length)
    : 0;
  const avgLeadTime = materials.length > 0
    ? Math.round(materials.reduce((acc, m) => acc + m.leadTimeDays, 0) / materials.length)
    : 0;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 48 }}>
      <PageHeader
        title="Material Master"
        description="Direct and indirect raw materials, standard unit purchasing costs, procurement lead times, and supplier codes."
        action={
          canManage && (
            <Button variant="primary" onClick={handleOpenCreate}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Material
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
          label="Total Raw Materials"
          value={materials.length}
          helperText="Standard inventory items"
        />
        <SummaryMetric
          label="Active Materials"
          value={activeMaterials}
          helperText="Available for BOM assignment"
        />
        <SummaryMetric
          label="Avg Unit Cost"
          value={formatMoney(avgCostCents, 'USD')}
          helperText="Average unit cost"
        />
        <SummaryMetric
          label="Avg Lead Time"
          value={`${avgLeadTime} days`}
          helperText="Procurement replenishment"
        />
      </div>

      {/* Main Table Card */}
      <Card>
        <CardHeader>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <CardTitle>Procurement Materials</CardTitle>
              <CardDescription>Direct inputs for BOM composition and cost rollups</CardDescription>
            </div>
            {/* Filter toolbar */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Search code, name, category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  height: 36,
                  padding: '0 12px',
                  borderRadius: 6,
                  border: '1px solid var(--border-default)',
                  fontSize: '0.875rem',
                  outline: 'none',
                  minWidth: 200,
                }}
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                style={{
                  height: 36,
                  padding: '0 10px',
                  borderRadius: 6,
                  border: '1px solid var(--border-default)',
                  fontSize: '0.875rem',
                  backgroundColor: '#FFFFFF',
                }}
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active Only</option>
                <option value="INACTIVE">Inactive Only</option>
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent style={{ padding: 0 }}>
          {isLoading ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
              Loading procurement materials...
            </div>
          ) : materials.length === 0 ? (
            <EmptyState
              title="No materials found"
              description={searchQuery ? 'Try adjusting your search criteria' : 'Create raw materials to begin linking components to Bills of Materials.'}
              action={
                canManage && !searchQuery ? (
                  <Button variant="primary" onClick={handleOpenCreate}>
                    Add Material
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid var(--border-default)' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Code</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Material Name</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Category</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>UOM</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Std Cost</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Lead Time</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Supplier Ref</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Usage</th>
                    {canManage && <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {materials.map((m) => (
                    <tr
                      key={m.id}
                      style={{
                        borderBottom: '1px solid var(--border-default)',
                        transition: 'background-color 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td style={{ padding: '12px 16px', fontWeight: 600, fontFamily: 'monospace' }}>
                        {m.code}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{m.name}</div>
                        {m.description && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {m.description}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                        {m.category}
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>
                        {m.unitOfMeasure}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, fontFamily: 'monospace' }}>
                        {formatMoney(m.defaultCostCents, m.currency)}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                        {m.leadTimeDays} days
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                        {m.supplierReference || '—'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <Badge variant={m.isActive ? 'success' : 'neutral'}>
                          {m.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                        {m._count?.bomLines || 0} BOM lines
                      </td>
                      {canManage && (
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(m)}>
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(m)}
                              style={{ color: 'var(--color-danger)' }}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Modal */}
      {isCreateOpen && (
        <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create Material Master">
          <form onSubmit={handleSubmitCreate}>
            {modalError && <Alert variant="danger" style={{ marginBottom: 16 }}>{modalError}</Alert>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }}>
              <Input
                label="Material Code"
                placeholder="e.g. RM-STEEL-01"
                required
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              />
              <Input
                label="Material Name"
                placeholder="e.g. Stainless Steel 316 Sheet"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <Input
                label="Description"
                placeholder="Detailed raw material specifications"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <Input
                label="Category"
                placeholder="e.g. Metals, Plastics"
                required
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              />
              <Input
                label="Unit of Measure (UOM)"
                placeholder="KG"
                required
                maxLength={10}
                value={formData.unitOfMeasure}
                onChange={(e) => setFormData({ ...formData, unitOfMeasure: e.target.value.toUpperCase() })}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <Input
                label="Standard Cost ($)"
                type="number"
                step="0.01"
                min="0"
                required
                value={formData.costDollars}
                onChange={(e) => setFormData({ ...formData, costDollars: e.target.value })}
              />
              <Input
                label="Currency"
                maxLength={3}
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <Input
                label="Lead Time (Days)"
                type="number"
                min="0"
                required
                value={formData.leadTimeDays}
                onChange={(e) => setFormData({ ...formData, leadTimeDays: Number(e.target.value) })}
              />
              <Input
                label="Supplier Reference / SKU"
                placeholder="e.g. SUP-99201"
                value={formData.supplierReference}
                onChange={(e) => setFormData({ ...formData, supplierReference: e.target.value })}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Material'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Modal */}
      {editingMaterial && (
        <Modal isOpen={!!editingMaterial} onClose={() => setEditingMaterial(null)} title={`Edit Material (${editingMaterial.code})`}>
          <form onSubmit={handleSubmitEdit}>
            {modalError && <Alert variant="danger" style={{ marginBottom: 16 }}>{modalError}</Alert>}
            <div style={{ marginBottom: 12 }}>
              <Input
                label="Material Name"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <Input
                label="Description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <Input
                label="Category"
                required
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              />
              <Input
                label="UOM"
                required
                maxLength={10}
                value={formData.unitOfMeasure}
                onChange={(e) => setFormData({ ...formData, unitOfMeasure: e.target.value.toUpperCase() })}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <Input
                label="Standard Cost ($)"
                type="number"
                step="0.01"
                min="0"
                required
                value={formData.costDollars}
                onChange={(e) => setFormData({ ...formData, costDollars: e.target.value })}
              />
              <Input
                label="Currency"
                maxLength={3}
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <Input
                label="Lead Time (Days)"
                type="number"
                min="0"
                required
                value={formData.leadTimeDays}
                onChange={(e) => setFormData({ ...formData, leadTimeDays: Number(e.target.value) })}
              />
              <Input
                label="Supplier Reference"
                value={formData.supplierReference}
                onChange={(e) => setFormData({ ...formData, supplierReference: e.target.value })}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                />
                Active Material Status
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button type="button" variant="secondary" onClick={() => setEditingMaterial(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
