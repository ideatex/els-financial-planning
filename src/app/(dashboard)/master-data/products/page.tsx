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

interface Product {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  category: string;
  productType: string;
  unitOfMeasure: string;
  standardPriceCents: number;
  currency: string;
  isActive: boolean;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  defaultPlant?: { id: string; code: string; name: string } | null;
  _count?: {
    bomHeaders: number;
    routingHeaders: number;
  };
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

const PRODUCT_TYPES = [
  { value: 'FINISHED_GOOD', label: 'Finished Good' },
  { value: 'SEMI_FINISHED_GOOD', label: 'Semi-Finished Good' },
  { value: 'RAW_MATERIAL', label: 'Raw Material' },
  { value: 'PACKAGING', label: 'Packaging' },
  { value: 'SERVICE', label: 'Service' },
  { value: 'OTHER', label: 'Other' },
];

export default function ProductsPage() {
  const [context, setContext] = useState<CurrentUserContext | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [plants, setPlants] = useState<PlantOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modal states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    category: '',
    productType: 'FINISHED_GOOD',
    unitOfMeasure: 'EA',
    defaultPlantId: '',
    priceDollars: '0.00',
    currency: 'USD',
    effectiveFrom: '',
    effectiveTo: '',
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
      if (typeFilter !== 'ALL') params.set('productType', typeFilter);
      if (statusFilter === 'ACTIVE') params.set('isActive', 'true');
      if (statusFilter === 'INACTIVE') params.set('isActive', 'false');

      const [prodRes, plantRes] = await Promise.all([
        fetch(`/api/master-data/products?${params.toString()}`),
        fetch('/api/master-data/plants'),
      ]);

      if (!prodRes.ok) throw new Error('Failed to load products');
      const prodData = await prodRes.json();
      setProducts(prodData.products);

      if (plantRes.ok) {
        const plantData = await plantRes.json();
        setPlants(plantData.plants);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred loading products');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, typeFilter, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenCreate = () => {
    setFormData({
      code: '',
      name: '',
      description: '',
      category: 'Electronics',
      productType: 'FINISHED_GOOD',
      unitOfMeasure: 'EA',
      defaultPlantId: plants[0]?.id || '',
      priceDollars: '100.00',
      currency: 'USD',
      effectiveFrom: '',
      effectiveTo: '',
      isActive: true,
    });
    setModalError(null);
    setIsCreateOpen(true);
  };

  const handleOpenEdit = (prod: Product) => {
    setEditingProduct(prod);
    setFormData({
      code: prod.code,
      name: prod.name,
      description: prod.description || '',
      category: prod.category,
      productType: prod.productType,
      unitOfMeasure: prod.unitOfMeasure,
      defaultPlantId: prod.defaultPlant?.id || '',
      priceDollars: (prod.standardPriceCents / 100).toFixed(2),
      currency: prod.currency,
      effectiveFrom: prod.effectiveFrom ? prod.effectiveFrom.slice(0, 10) : '',
      effectiveTo: prod.effectiveTo ? prod.effectiveTo.slice(0, 10) : '',
      isActive: prod.isActive,
    });
    setModalError(null);
  };

  const handleSubmitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setModalError(null);
    try {
      const standardPriceCents = Math.round(parseFloat(formData.priceDollars || '0') * 100);
      if (isNaN(standardPriceCents) || standardPriceCents < 0) {
        throw new Error('Standard price must be a valid non-negative number');
      }

      const payload = {
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        category: formData.category.trim(),
        productType: formData.productType,
        unitOfMeasure: formData.unitOfMeasure.trim().toUpperCase(),
        defaultPlantId: formData.defaultPlantId || null,
        standardPriceCents,
        currency: formData.currency,
        effectiveFrom: formData.effectiveFrom ? new Date(formData.effectiveFrom).toISOString() : null,
        effectiveTo: formData.effectiveTo ? new Date(formData.effectiveTo).toISOString() : null,
        isActive: formData.isActive,
      };

      const res = await fetch('/api/master-data/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create product');

      setIsCreateOpen(false);
      setSuccessMsg(`Product "${formData.name}" (${formData.code}) created successfully.`);
      loadData();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Error creating product');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setIsSubmitting(true);
    setModalError(null);
    try {
      const standardPriceCents = Math.round(parseFloat(formData.priceDollars || '0') * 100);
      if (isNaN(standardPriceCents) || standardPriceCents < 0) {
        throw new Error('Standard price must be a valid non-negative number');
      }

      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        category: formData.category.trim(),
        productType: formData.productType,
        unitOfMeasure: formData.unitOfMeasure.trim().toUpperCase(),
        defaultPlantId: formData.defaultPlantId || null,
        standardPriceCents,
        currency: formData.currency,
        effectiveFrom: formData.effectiveFrom ? new Date(formData.effectiveFrom).toISOString() : null,
        effectiveTo: formData.effectiveTo ? new Date(formData.effectiveTo).toISOString() : null,
        isActive: formData.isActive,
      };

      const res = await fetch(`/api/master-data/products/${editingProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update product');

      setEditingProduct(null);
      setSuccessMsg(`Product "${formData.name}" updated successfully.`);
      loadData();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Error updating product');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (product: Product) => {
    if (!window.confirm(`Are you sure you want to delete product ${product.code} (${product.name})?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/master-data/products/${product.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete product');

      setSuccessMsg(`Product ${product.code} deleted.`);
      loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete product');
    }
  };

  const formatMoney = (cents: number, cur: string) => {
    return (cents / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: cur || 'USD',
    });
  };

  const finishedCount = products.filter((p) => p.productType === 'FINISHED_GOOD').length;
  const semiFinishedCount = products.filter((p) => p.productType === 'SEMI_FINISHED_GOOD').length;
  const avgPriceCents = products.length > 0
    ? Math.round(products.reduce((acc, p) => acc + p.standardPriceCents, 0) / products.length)
    : 0;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 48 }}>
      <PageHeader
        title="Product Master"
        description="Manage product SKUs, finished and semi-finished goods, pricing, and plant assignments."
        action={
          canManage && (
            <Button variant="primary" onClick={handleOpenCreate}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Product
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
          label="Total SKUs"
          value={products.length}
          helperText="Active and planned catalog"
        />
        <SummaryMetric
          label="Finished Goods"
          value={finishedCount}
          helperText="Direct revenue products"
        />
        <SummaryMetric
          label="Subassemblies"
          value={semiFinishedCount}
          helperText="Intermediate production items"
        />
        <SummaryMetric
          label="Avg Standard Price"
          value={formatMoney(avgPriceCents, 'USD')}
          helperText="Average standard price"
        />
      </div>

      {/* Main Table Card */}
      <Card>
        <CardHeader>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <CardTitle>Catalog Products</CardTitle>
              <CardDescription>Product hierarchy, costing defaults, and production assignments</CardDescription>
            </div>
            {/* Filter toolbar */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Search SKU, name, category..."
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
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                style={{
                  height: 36,
                  padding: '0 10px',
                  borderRadius: 6,
                  border: '1px solid var(--border-default)',
                  fontSize: '0.875rem',
                  backgroundColor: '#FFFFFF',
                }}
              >
                <option value="ALL">All Types</option>
                {PRODUCT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
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
              Loading product catalog...
            </div>
          ) : products.length === 0 ? (
            <EmptyState
              title="No products found"
              description={searchQuery ? 'Try adjusting your filter parameters' : 'Register your first manufacturing SKU to begin building BOMs and routings.'}
              action={
                canManage && !searchQuery ? (
                  <Button variant="primary" onClick={handleOpenCreate}>
                    Add Product
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid var(--border-default)' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>SKU</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Product Name</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Category</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Type</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>UOM</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Std Price</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Default Plant</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                    {canManage && <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {products.map((prod) => (
                    <tr
                      key={prod.id}
                      style={{
                        borderBottom: '1px solid var(--border-default)',
                        transition: 'background-color 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td style={{ padding: '12px 16px', fontWeight: 600, fontFamily: 'monospace' }}>
                        {prod.code}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{prod.name}</div>
                        {prod.description && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {prod.description}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                        {prod.category}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          backgroundColor: prod.productType === 'FINISHED_GOOD' ? '#EFF6FF' : '#F1F5F9',
                          color: prod.productType === 'FINISHED_GOOD' ? '#1D4ED8' : '#475569',
                        }}>
                          {PRODUCT_TYPES.find((t) => t.value === prod.productType)?.label || prod.productType}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>
                        {prod.unitOfMeasure}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, fontFamily: 'monospace' }}>
                        {formatMoney(prod.standardPriceCents, prod.currency)}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                        {prod.defaultPlant ? `${prod.defaultPlant.code} (${prod.defaultPlant.name})` : '—'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <Badge variant={prod.isActive ? 'success' : 'neutral'}>
                          {prod.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      {canManage && (
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(prod)}>
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(prod)}
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
        <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create Product Master">
          <form onSubmit={handleSubmitCreate}>
            {modalError && <Alert variant="danger" style={{ marginBottom: 16 }}>{modalError}</Alert>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }}>
              <Input
                label="SKU Code"
                placeholder="e.g. FG-WIDGET-01"
                required
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              />
              <Input
                label="Product Name"
                placeholder="e.g. Industrial IoT Sensor Hub"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <Input
                label="Description"
                placeholder="Technical specifications or description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <Input
                label="Category"
                placeholder="e.g. Electronics"
                required
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              />
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 4 }}>
                  Product Type
                </label>
                <select
                  value={formData.productType}
                  onChange={(e) => setFormData({ ...formData, productType: e.target.value })}
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
                  {PRODUCT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <Input
                label="Unit of Measure (UOM)"
                placeholder="EA"
                required
                maxLength={10}
                value={formData.unitOfMeasure}
                onChange={(e) => setFormData({ ...formData, unitOfMeasure: e.target.value.toUpperCase() })}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <Input
                label="Standard Price ($)"
                placeholder="250.00"
                type="number"
                step="0.01"
                min="0"
                required
                value={formData.priceDollars}
                onChange={(e) => setFormData({ ...formData, priceDollars: e.target.value })}
              />
              <Input
                label="Currency"
                maxLength={3}
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
              />
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 4 }}>
                  Default Plant
                </label>
                <select
                  value={formData.defaultPlantId}
                  onChange={(e) => setFormData({ ...formData, defaultPlantId: e.target.value })}
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
                  <option value="">None (Unassigned)</option>
                  {plants.map((p) => (
                    <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <Input
                label="Effective From"
                type="date"
                value={formData.effectiveFrom}
                onChange={(e) => setFormData({ ...formData, effectiveFrom: e.target.value })}
              />
              <Input
                label="Effective To"
                type="date"
                value={formData.effectiveTo}
                onChange={(e) => setFormData({ ...formData, effectiveTo: e.target.value })}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Product'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Modal */}
      {editingProduct && (
        <Modal isOpen={!!editingProduct} onClose={() => setEditingProduct(null)} title={`Edit Product (${editingProduct.code})`}>
          <form onSubmit={handleSubmitEdit}>
            {modalError && <Alert variant="danger" style={{ marginBottom: 16 }}>{modalError}</Alert>}
            <div style={{ marginBottom: 12 }}>
              <Input
                label="Product Name"
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
                label="Category"
                required
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              />
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 4 }}>
                  Product Type
                </label>
                <select
                  value={formData.productType}
                  onChange={(e) => setFormData({ ...formData, productType: e.target.value })}
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
                  {PRODUCT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <Input
                label="UOM"
                required
                maxLength={10}
                value={formData.unitOfMeasure}
                onChange={(e) => setFormData({ ...formData, unitOfMeasure: e.target.value.toUpperCase() })}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <Input
                label="Standard Price ($)"
                type="number"
                step="0.01"
                min="0"
                required
                value={formData.priceDollars}
                onChange={(e) => setFormData({ ...formData, priceDollars: e.target.value })}
              />
              <Input
                label="Currency"
                maxLength={3}
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
              />
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 4 }}>
                  Default Plant
                </label>
                <select
                  value={formData.defaultPlantId}
                  onChange={(e) => setFormData({ ...formData, defaultPlantId: e.target.value })}
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
                  <option value="">None (Unassigned)</option>
                  {plants.map((p) => (
                    <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <Input
                label="Effective From"
                type="date"
                value={formData.effectiveFrom}
                onChange={(e) => setFormData({ ...formData, effectiveFrom: e.target.value })}
              />
              <Input
                label="Effective To"
                type="date"
                value={formData.effectiveTo}
                onChange={(e) => setFormData({ ...formData, effectiveTo: e.target.value })}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                />
                Active Product Status
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button type="button" variant="secondary" onClick={() => setEditingProduct(null)}>
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
