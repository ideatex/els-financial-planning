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

interface Account {
  id: string;
  code: string;
  name: string;
  accountType: string;
  parentAccountId?: string | null;
  description?: string | null;
  normalBalance: 'DEBIT' | 'CREDIT';
  currency: string;
  isActive: boolean;
  parentAccount?: { id: string; code: string; name: string } | null;
  childAccounts?: Account[];
  _count?: { childAccounts: number };
}

interface CurrentUserContext {
  user: { id: string; email: string; name: string };
  organization: { id: string; name: string; slug: string } | null;
  membership: { id: string; role: Role } | null;
}

const ACCOUNT_TYPES = [
  { value: 'ASSET', label: 'Asset', defaultNormal: 'DEBIT' },
  { value: 'LIABILITY', label: 'Liability', defaultNormal: 'CREDIT' },
  { value: 'EQUITY', label: 'Equity', defaultNormal: 'CREDIT' },
  { value: 'REVENUE', label: 'Revenue', defaultNormal: 'CREDIT' },
  { value: 'COGS', label: 'Cost of Goods Sold (COGS)', defaultNormal: 'DEBIT' },
  { value: 'OPERATING_EXPENSE', label: 'Operating Expense (OPEX)', defaultNormal: 'DEBIT' },
  { value: 'OTHER_INCOME', label: 'Other Income', defaultNormal: 'CREDIT' },
  { value: 'OTHER_EXPENSE', label: 'Other Expense', defaultNormal: 'DEBIT' },
  { value: 'TAX', label: 'Tax', defaultNormal: 'DEBIT' },
];

export default function ChartOfAccountsPage() {
  const [context, setContext] = useState<CurrentUserContext | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isTreeMode, setIsTreeMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    accountType: 'COGS',
    parentAccountId: '',
    normalBalance: 'DEBIT' as 'DEBIT' | 'CREDIT',
    currency: 'USD',
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
      if (isTreeMode) {
        params.set('asTree', 'true');
      } else {
        if (searchQuery) params.set('search', searchQuery);
        if (typeFilter !== 'ALL') params.set('accountType', typeFilter);
      }

      const res = await fetch(`/api/master-data/chart-of-accounts?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load chart of accounts');
      const data = await res.json();
      setAccounts(data.accounts);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading chart of accounts');
    } finally {
      setIsLoading(false);
    }
  }, [isTreeMode, searchQuery, typeFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenCreate = () => {
    setFormData({
      code: '',
      name: '',
      description: '',
      accountType: 'COGS',
      parentAccountId: '',
      normalBalance: 'DEBIT',
      currency: 'USD',
      isActive: true,
    });
    setModalError(null);
    setIsCreateOpen(true);
  };

  const handleOpenEdit = (acc: Account) => {
    setEditingAccount(acc);
    setFormData({
      code: acc.code,
      name: acc.name,
      description: acc.description || '',
      accountType: acc.accountType,
      parentAccountId: acc.parentAccountId || '',
      normalBalance: acc.normalBalance,
      currency: acc.currency,
      isActive: acc.isActive,
    });
    setModalError(null);
  };

  const handleTypeChange = (typeVal: string) => {
    const matched = ACCOUNT_TYPES.find((t) => t.value === typeVal);
    setFormData({
      ...formData,
      accountType: typeVal,
      normalBalance: (matched?.defaultNormal as 'DEBIT' | 'CREDIT') || 'DEBIT',
    });
  };

  const handleSubmitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setModalError(null);
    try {
      const payload = {
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        accountType: formData.accountType,
        parentAccountId: formData.parentAccountId || null,
        normalBalance: formData.normalBalance,
        currency: formData.currency,
        isActive: formData.isActive,
      };

      const res = await fetch('/api/master-data/chart-of-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create account');

      setIsCreateOpen(false);
      setSuccessMsg(`Account "${formData.name}" (${formData.code}) created successfully.`);
      loadData();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Error creating account');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;
    setIsSubmitting(true);
    setModalError(null);
    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        accountType: formData.accountType,
        parentAccountId: formData.parentAccountId || null,
        normalBalance: formData.normalBalance,
        currency: formData.currency,
        isActive: formData.isActive,
      };

      const res = await fetch(`/api/master-data/chart-of-accounts/${editingAccount.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update account');

      setEditingAccount(null);
      setSuccessMsg(`Account "${formData.name}" updated.`);
      loadData();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Error updating account');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (acc: Account) => {
    if (!window.confirm(`Are you sure you want to delete account ${acc.code} (${acc.name})?`)) return;
    try {
      const res = await fetch(`/api/master-data/chart-of-accounts/${acc.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete account');

      setSuccessMsg(`Account ${acc.code} deleted.`);
      loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete account');
    }
  };

  const getTypeBadge = (type: string) => {
    const isBalanceSheet = ['ASSET', 'LIABILITY', 'EQUITY'].includes(type);
    return (
      <span style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: '0.75rem',
        fontWeight: 500,
        backgroundColor: isBalanceSheet ? '#EFF6FF' : '#FEF3C7',
        color: isBalanceSheet ? '#1D4ED8' : '#92400E',
      }}>
        {type.replace('_', ' ')}
      </span>
    );
  };

  const renderTreeRows = (accs: Account[], depth = 0): React.ReactNode => {
    return accs.map((acc) => (
      <React.Fragment key={acc.id}>
        <tr
          style={{
            borderBottom: '1px solid var(--border-default)',
            transition: 'background-color 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <td style={{ padding: '12px 16px', fontWeight: 600, fontFamily: 'monospace' }}>
            <span style={{ paddingLeft: depth * 24 }}>
              {depth > 0 && <span style={{ color: 'var(--text-secondary)', marginRight: 6 }}>└─</span>}
              {acc.code}
            </span>
          </td>
          <td style={{ padding: '12px 16px' }}>
            <div style={{ fontWeight: 500 }}>{acc.name}</div>
            {acc.description && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{acc.description}</div>
            )}
          </td>
          <td style={{ padding: '12px 16px' }}>{getTypeBadge(acc.accountType)}</td>
          <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>
            <span style={{ color: acc.normalBalance === 'DEBIT' ? '#047857' : '#B45309', fontWeight: 600 }}>
              {acc.normalBalance}
            </span>
          </td>
          <td style={{ padding: '12px 16px' }}>
            <Badge variant={acc.isActive ? 'success' : 'neutral'}>
              {acc.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </td>
          {canManage && (
            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(acc)}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(acc)}
                  style={{ color: 'var(--color-danger)' }}
                >
                  Delete
                </Button>
              </div>
            </td>
          )}
        </tr>
        {acc.childAccounts && acc.childAccounts.length > 0 && renderTreeRows(acc.childAccounts, depth + 1)}
      </React.Fragment>
    ));
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 48 }}>
      <PageHeader
        title="Chart of Accounts"
        description="Manage general ledger accounts, classifications, and financial reporting structure."
        action={
          canManage && (
            <Button variant="primary" onClick={handleOpenCreate}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Account
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
          label="Total Accounts"
          value={accounts.length}
          helperText="General ledger accounts"
        />
        <SummaryMetric
          label="Reporting Currency"
          value="USD"
          helperText="Base reporting currency"
        />
        <SummaryMetric
          label="P&L Cost Accounts"
          value={accounts.filter((a) => a.accountType === 'COGS' || a.accountType === 'OPERATING_EXPENSE').length}
          helperText="Manufacturing cost rollups"
        />
        <SummaryMetric
          label="Hierarchy Depth"
          value={isTreeMode ? 'Tree View' : 'Tabular View'}
          helperText="Flexible display view"
        />
      </div>

      {/* Main Card */}
      <Card>
        <CardHeader>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <CardTitle>General Ledger Accounts</CardTitle>
              <CardDescription>Structured financial hierarchy with parent-child rollups</CardDescription>
            </div>
            {/* Toolbar */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Button
                variant={isTreeMode ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setIsTreeMode(!isTreeMode)}
              >
                {isTreeMode ? 'Switch to Table' : 'Hierarchical Tree'}
              </Button>
              {!isTreeMode && (
                <>
                  <input
                    type="text"
                    placeholder="Search code, name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      height: 34,
                      padding: '0 12px',
                      borderRadius: 6,
                      border: '1px solid var(--border-default)',
                      fontSize: '0.875rem',
                      outline: 'none',
                    }}
                  />
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    style={{
                      height: 34,
                      padding: '0 8px',
                      borderRadius: 6,
                      border: '1px solid var(--border-default)',
                      fontSize: '0.875rem',
                      backgroundColor: '#FFFFFF',
                    }}
                  >
                    <option value="ALL">All Account Types</option>
                    {ACCOUNT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent style={{ padding: 0 }}>
          {isLoading ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
              Loading chart of accounts...
            </div>
          ) : accounts.length === 0 ? (
            <EmptyState
              title="No GL accounts found"
              description="Configure your financial chart of accounts to enable statement reporting."
              action={
                canManage ? (
                  <Button variant="primary" onClick={handleOpenCreate}>
                    Add Account
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid var(--border-default)' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Account Code</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Account Name</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Type</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Normal Balance</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                    {canManage && <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {isTreeMode ? (
                    renderTreeRows(accounts)
                  ) : (
                    accounts.map((acc) => (
                      <tr
                        key={acc.id}
                        style={{
                          borderBottom: '1px solid var(--border-default)',
                          transition: 'background-color 0.15s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <td style={{ padding: '12px 16px', fontWeight: 600, fontFamily: 'monospace' }}>
                          {acc.code}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 500 }}>{acc.name}</div>
                          {acc.parentAccount && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              Parent: {acc.parentAccount.code} ({acc.parentAccount.name})
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px' }}>{getTypeBadge(acc.accountType)}</td>
                        <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>
                          <span style={{ color: acc.normalBalance === 'DEBIT' ? '#047857' : '#B45309', fontWeight: 600 }}>
                            {acc.normalBalance}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <Badge variant={acc.isActive ? 'success' : 'neutral'}>
                            {acc.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        {canManage && (
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(acc)}>
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(acc)}
                                style={{ color: 'var(--color-danger)' }}
                              >
                                Delete
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Modal */}
      {isCreateOpen && (
        <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create General Ledger Account">
          <form onSubmit={handleSubmitCreate}>
            {modalError && <Alert variant="danger" style={{ marginBottom: 16 }}>{modalError}</Alert>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }}>
              <Input
                label="Account Code"
                placeholder="e.g. 5010"
                required
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              />
              <Input
                label="Account Name"
                placeholder="e.g. Direct Material Cost"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <Input
                label="Description"
                placeholder="Financial reporting description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 4 }}>
                  Account Type
                </label>
                <select
                  value={formData.accountType}
                  onChange={(e) => handleTypeChange(e.target.value)}
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
                  {ACCOUNT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 4 }}>
                  Parent Account
                </label>
                <select
                  value={formData.parentAccountId}
                  onChange={(e) => setFormData({ ...formData, parentAccountId: e.target.value })}
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
                  <option value="">None (Top-Level Account)</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 4 }}>
                  Normal Balance
                </label>
                <select
                  value={formData.normalBalance}
                  onChange={(e) => setFormData({ ...formData, normalBalance: e.target.value as 'DEBIT' | 'CREDIT' })}
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
                  <option value="DEBIT">DEBIT</option>
                  <option value="CREDIT">CREDIT</option>
                </select>
              </div>
              <Input
                label="Currency"
                maxLength={3}
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Account'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Modal */}
      {editingAccount && (
        <Modal isOpen={!!editingAccount} onClose={() => setEditingAccount(null)} title={`Edit Account (${editingAccount.code})`}>
          <form onSubmit={handleSubmitEdit}>
            {modalError && <Alert variant="danger" style={{ marginBottom: 16 }}>{modalError}</Alert>}
            <div style={{ marginBottom: 12 }}>
              <Input
                label="Account Name"
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
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 4 }}>
                  Account Type
                </label>
                <select
                  value={formData.accountType}
                  onChange={(e) => handleTypeChange(e.target.value)}
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
                  {ACCOUNT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 4 }}>
                  Parent Account
                </label>
                <select
                  value={formData.parentAccountId}
                  onChange={(e) => setFormData({ ...formData, parentAccountId: e.target.value })}
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
                  <option value="">None (Top-Level)</option>
                  {accounts.filter((a) => a.id !== editingAccount.id).map((a) => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 4 }}>
                  Normal Balance
                </label>
                <select
                  value={formData.normalBalance}
                  onChange={(e) => setFormData({ ...formData, normalBalance: e.target.value as 'DEBIT' | 'CREDIT' })}
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
                  <option value="DEBIT">DEBIT</option>
                  <option value="CREDIT">CREDIT</option>
                </select>
              </div>
              <Input
                label="Currency"
                maxLength={3}
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                />
                Active Account Status
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button type="button" variant="secondary" onClick={() => setEditingAccount(null)}>
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
