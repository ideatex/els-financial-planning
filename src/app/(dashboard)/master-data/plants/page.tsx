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

interface Plant {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country: string;
  timeZone: string;
  baseCurrency: string;
  isActive: boolean;
  createdAt: string;
  _count?: {
    products: number;
    routingHeaders: number;
  };
}

interface CurrentUserContext {
  user: { id: string; email: string; name: string };
  organization: { id: string; name: string; slug: string } | null;
  membership: { id: string; role: Role } | null;
}

export default function PlantsPage() {
  const [context, setContext] = useState<CurrentUserContext | null>(null);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modal states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPlant, setEditingPlant] = useState<Plant | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    address: '',
    city: '',
    state: '',
    country: 'USA',
    timeZone: 'America/Detroit',
    baseCurrency: 'USD',
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

      const res = await fetch(`/api/master-data/plants?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load plants');
      const data = await res.json();
      setPlants(data.plants);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred loading plants');
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
      address: '',
      city: '',
      state: '',
      country: 'USA',
      timeZone: 'America/Detroit',
      baseCurrency: 'USD',
      isActive: true,
    });
    setModalError(null);
    setIsCreateOpen(true);
  };

  const handleOpenEdit = (plant: Plant) => {
    setEditingPlant(plant);
    setFormData({
      code: plant.code,
      name: plant.name,
      description: plant.description || '',
      address: plant.address || '',
      city: plant.city || '',
      state: plant.state || '',
      country: plant.country,
      timeZone: plant.timeZone,
      baseCurrency: plant.baseCurrency,
      isActive: plant.isActive,
    });
    setModalError(null);
  };

  const handleSubmitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setModalError(null);
    try {
      const res = await fetch('/api/master-data/plants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create plant');

      setIsCreateOpen(false);
      setSuccessMsg(`Plant "${formData.name}" (${formData.code}) created successfully.`);
      loadData();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Error creating plant');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlant) return;
    setIsSubmitting(true);
    setModalError(null);
    try {
      const { code, ...updatePayload } = formData;
      const res = await fetch(`/api/master-data/plants/${editingPlant.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update plant');

      setEditingPlant(null);
      setSuccessMsg(`Plant "${formData.name}" updated successfully.`);
      loadData();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Error updating plant');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (plant: Plant) => {
    if (!window.confirm(`Are you sure you want to delete plant ${plant.code} (${plant.name})?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/master-data/plants/${plant.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete plant');

      setSuccessMsg(`Plant ${plant.code} deleted successfully.`);
      loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete plant');
    }
  };

  const activeCount = plants.filter((p) => p.isActive).length;
  const totalProducts = plants.reduce((acc, p) => acc + (p._count?.products || 0), 0);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 48 }}>
      <PageHeader
        title="Plant Management"
        description="Configure manufacturing plants, geographic locations, operating timezones, and plant currencies."
        action={
          canManage && (
            <Button variant="primary" onClick={handleOpenCreate}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Plant
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
          label="Total Facilities"
          value={plants.length}
          helperText="Configured manufacturing sites"
        />
        <SummaryMetric
          label="Active Facilities"
          value={activeCount}
          helperText={`${plants.length - activeCount} inactive`}
        />
        <SummaryMetric
          label="Assigned Products"
          value={totalProducts}
          helperText="Across all facilities"
        />
        <SummaryMetric
          label="Primary Currency"
          value={plants[0]?.baseCurrency || 'USD'}
          helperText="Base financial reporting"
        />
      </div>

      {/* Main Table Card */}
      <Card>
        <CardHeader>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <CardTitle>Manufacturing Facilities</CardTitle>
              <CardDescription>Multi-plant hierarchy and operational parameters</CardDescription>
            </div>
            {/* Toolbar */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Search code, name, city..."
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
              Loading manufacturing facilities...
            </div>
          ) : plants.length === 0 ? (
            <EmptyState
              title="No facilities found"
              description={searchQuery ? 'Try adjusting your search criteria' : 'Create your first manufacturing plant to begin modeling operations.'}
              action={
                canManage && !searchQuery ? (
                  <Button variant="primary" onClick={handleOpenCreate}>
                    Add Plant
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
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Facility Name</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Location</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Time Zone</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Currency</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Usage</th>
                    {canManage && <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {plants.map((plant) => (
                    <tr
                      key={plant.id}
                      style={{
                        borderBottom: '1px solid var(--border-default)',
                        transition: 'background-color 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td style={{ padding: '12px 16px', fontWeight: 600, fontFamily: 'monospace' }}>
                        {plant.code}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{plant.name}</div>
                        {plant.description && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {plant.description}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                        {[plant.city, plant.state, plant.country].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                        {plant.timeZone}
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>
                        {plant.baseCurrency}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <Badge variant={plant.isActive ? 'success' : 'neutral'}>
                          {plant.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                        <span style={{ fontSize: '0.75rem' }}>
                          {plant._count?.products || 0} products · {plant._count?.routingHeaders || 0} routings
                        </span>
                      </td>
                      {canManage && (
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(plant)}>
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(plant)}
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
        <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create Manufacturing Facility">
          <form onSubmit={handleSubmitCreate}>
            {modalError && <Alert variant="danger" style={{ marginBottom: 16 }}>{modalError}</Alert>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }}>
              <Input
                label="Facility Code"
                placeholder="e.g. DET-01"
                required
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              />
              <Input
                label="Facility Name"
                placeholder="e.g. Detroit Assembly Plant"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <Input
                label="Description"
                placeholder="Optional facility description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <Input
                label="City"
                placeholder="Detroit"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              />
              <Input
                label="State / Province"
                placeholder="MI"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
              />
              <Input
                label="Country"
                placeholder="USA"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <Input
                label="Operating Timezone"
                placeholder="America/Detroit"
                value={formData.timeZone}
                onChange={(e) => setFormData({ ...formData, timeZone: e.target.value })}
              />
              <Input
                label="Base Currency (ISO)"
                placeholder="USD"
                maxLength={3}
                value={formData.baseCurrency}
                onChange={(e) => setFormData({ ...formData, baseCurrency: e.target.value.toUpperCase() })}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Facility'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Modal */}
      {editingPlant && (
        <Modal isOpen={!!editingPlant} onClose={() => setEditingPlant(null)} title={`Edit Facility (${editingPlant.code})`}>
          <form onSubmit={handleSubmitEdit}>
            {modalError && <Alert variant="danger" style={{ marginBottom: 16 }}>{modalError}</Alert>}
            <div style={{ marginBottom: 12 }}>
              <Input
                label="Facility Name"
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <Input
                label="City"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              />
              <Input
                label="State"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
              />
              <Input
                label="Country"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <Input
                label="Time Zone"
                value={formData.timeZone}
                onChange={(e) => setFormData({ ...formData, timeZone: e.target.value })}
              />
              <Input
                label="Currency"
                maxLength={3}
                value={formData.baseCurrency}
                onChange={(e) => setFormData({ ...formData, baseCurrency: e.target.value.toUpperCase() })}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                />
                Active Facility Status
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button type="button" variant="secondary" onClick={() => setEditingPlant(null)}>
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
