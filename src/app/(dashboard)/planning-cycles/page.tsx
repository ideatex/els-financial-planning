'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
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

interface PlanningCycle {
  id: string;
  name: string;
  planningType: string;
  fiscalYear: number;
  description?: string | null;
  status: 'DRAFT' | 'OPEN' | 'IN_REVIEW' | 'APPROVED' | 'CLOSED' | 'ARCHIVED';
  startPeriod?: { id: string; periodName: string } | null;
  endPeriod?: { id: string; periodName: string } | null;
  owner?: { id: string; name: string; email: string } | null;
  _count?: { planVersions: number };
}

interface FiscalPeriodOption {
  id: string;
  periodName: string;
  fiscalYear: number;
  periodNumber: number;
}

interface CurrentUserContext {
  user: { id: string; email: string; name: string };
  organization: { id: string; name: string; slug: string } | null;
  membership: { id: string; role: Role } | null;
}

const PLANNING_TYPES = [
  { value: 'ANNUAL_BUDGET', label: 'Annual Operating Budget' },
  { value: 'ROLLING_FORECAST', label: 'Rolling Forecast' },
  { value: 'MONTHLY_FORECAST', label: 'Monthly Forecast' },
  { value: 'SCENARIO_PLAN', label: 'Scenario Plan' },
];

export default function PlanningCyclesPage() {
  const [context, setContext] = useState<CurrentUserContext | null>(null);
  const [cycles, setCycles] = useState<PlanningCycle[]>([]);
  const [periods, setPeriods] = useState<FiscalPeriodOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: 'FY2026 Annual Budget',
    planningType: 'ANNUAL_BUDGET',
    fiscalYear: 2026,
    startPeriodId: '',
    endPeriodId: '',
    description: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const canManage = context?.membership?.role
    ? hasPermission(context.membership.role, Permissions.PLAN_CYCLE_MANAGE)
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
      if (statusFilter !== 'ALL') params.set('status', statusFilter);

      const [cyclesRes, calRes] = await Promise.all([
        fetch(`/api/planning/cycles?${params.toString()}`),
        fetch('/api/master-data/fiscal-calendar'),
      ]);

      if (!cyclesRes.ok) throw new Error('Failed to load planning cycles');
      const cyclesData = await cyclesRes.json();
      setCycles(cyclesData.cycles);

      if (calRes.ok) {
        const calData = await calRes.json();
        const allPeriods = calData.calendars.flatMap((c: any) => c.periods || []);
        setPeriods(allPeriods);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading planning cycles');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setModalError(null);
    try {
      const payload = {
        name: formData.name.trim(),
        planningType: formData.planningType,
        fiscalYear: Number(formData.fiscalYear),
        startPeriodId: formData.startPeriodId || null,
        endPeriodId: formData.endPeriodId || null,
        description: formData.description.trim() || null,
      };

      const res = await fetch('/api/planning/cycles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create planning cycle');

      setIsCreateOpen(false);
      setSuccessMsg(`Planning cycle "${formData.name}" created successfully.`);
      loadData();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Error creating cycle');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (cycleId: string, status: string) => {
    try {
      const res = await fetch(`/api/planning/cycles/${cycleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update cycle status');

      setSuccessMsg(`Cycle status updated to ${status}.`);
      loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error updating cycle status');
    }
  };

  const handleDelete = async (cycle: PlanningCycle) => {
    if (!window.confirm(`Are you sure you want to delete planning cycle "${cycle.name}"?`)) return;
    try {
      const res = await fetch(`/api/planning/cycles/${cycle.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete cycle');

      setSuccessMsg(`Cycle "${cycle.name}" deleted.`);
      loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete cycle');
    }
  };

  const getStatusVariant = (s: string) => {
    switch (s) {
      case 'OPEN': return 'success';
      case 'APPROVED': return 'primary';
      case 'IN_REVIEW': return 'warning';
      case 'DRAFT': return 'neutral';
      case 'CLOSED': return 'neutral';
      case 'ARCHIVED': return 'neutral';
      default: return 'neutral';
    }
  };

  const openCycles = cycles.filter((c) => c.status === 'OPEN').length;
  const inReviewCycles = cycles.filter((c) => c.status === 'IN_REVIEW').length;
  const approvedCycles = cycles.filter((c) => c.status === 'APPROVED').length;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 48 }}>
      <PageHeader
        title="Planning Cycles"
        description="Manage annual budgets, rolling forecasts, and strategic planning cycles."
        action={
          canManage && (
            <Button
              variant="primary"
              onClick={() => {
                const curYearPeriods = periods.filter((p) => p.fiscalYear === 2026);
                setFormData({
                  name: 'FY2026 Operating Budget',
                  planningType: 'ANNUAL_BUDGET',
                  fiscalYear: 2026,
                  startPeriodId: curYearPeriods[0]?.id || '',
                  endPeriodId: curYearPeriods[curYearPeriods.length - 1]?.id || '',
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
              Create Planning Cycle
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
          label="Total Cycles"
          value={cycles.length}
          helperText="All configured cycles"
        />
        <SummaryMetric
          label="Open Cycles"
          value={openCycles}
          helperText="Active planning cycles"
        />
        <SummaryMetric
          label="In Review"
          value={inReviewCycles}
          helperText="Pending management approval"
        />
        <SummaryMetric
          label="Approved Cycles"
          value={approvedCycles}
          helperText="Approved baselines"
        />
      </div>

      <Card>
        <CardHeader>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <CardTitle>Planning Cycles</CardTitle>
              <CardDescription>Select a cycle to view details and manage plan versions</CardDescription>
            </div>
            {/* Toolbar */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Search cycles..."
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
                onChange={(e) => setStatusFilter(e.target.value)}
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
                <option value="DRAFT">Draft</option>
                <option value="OPEN">Open</option>
                <option value="IN_REVIEW">In Review</option>
                <option value="APPROVED">Approved</option>
                <option value="CLOSED">Closed</option>
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent style={{ padding: 0 }}>
          {isLoading ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
              Loading planning cycles...
            </div>
          ) : cycles.length === 0 ? (
            <EmptyState
              title="No planning cycles found"
              description="Establish an annual budget or forecast cycle to organize planning versions."
              action={
                canManage ? (
                  <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
                    Create Planning Cycle
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid var(--border-default)' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Cycle Name</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Type</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Fiscal Year</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Period Range</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Versions</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {cycles.map((cycle) => (
                    <tr
                      key={cycle.id}
                      style={{
                        borderBottom: '1px solid var(--border-default)',
                        transition: 'background-color 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <Link
                          href={`/planning-cycles/${cycle.id}/versions`}
                          style={{ fontWeight: 600, color: 'var(--color-primary)', textDecoration: 'none' }}
                        >
                          {cycle.name}
                        </Link>
                        {cycle.description && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{cycle.description}</div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          backgroundColor: '#EFF6FF',
                          color: '#1D4ED8',
                        }}>
                          {PLANNING_TYPES.find((t) => t.value === cycle.planningType)?.label || cycle.planningType}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 600, fontFamily: 'monospace' }}>
                        FY{cycle.fiscalYear}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                        {cycle.startPeriod && cycle.endPeriod
                          ? `${cycle.startPeriod.periodName} → ${cycle.endPeriod.periodName}`
                          : 'Full Year (All Periods)'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <Link
                          href={`/planning-cycles/${cycle.id}/versions`}
                          style={{ fontWeight: 600, color: 'var(--color-primary)', textDecoration: 'underline' }}
                        >
                          {cycle._count?.planVersions || 0} versions
                        </Link>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <Badge variant={getStatusVariant(cycle.status)}>
                          {cycle.status}
                        </Badge>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                          <Link href={`/planning-cycles/${cycle.id}/versions`}>
                            <Button variant="secondary" size="sm">
                              Manage Versions
                            </Button>
                          </Link>
                          {canManage && (
                            <>
                              {cycle.status === 'DRAFT' && (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={() => handleUpdateStatus(cycle.id, 'OPEN')}
                                >
                                  Open
                                </Button>
                              )}
                              {cycle.status === 'OPEN' && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleUpdateStatus(cycle.id, 'IN_REVIEW')}
                                >
                                  In Review
                                </Button>
                              )}
                              {cycle.status === 'IN_REVIEW' && (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={() => handleUpdateStatus(cycle.id, 'APPROVED')}
                                >
                                  Approve
                                </Button>
                              )}
                              {cycle.status === 'APPROVED' && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleUpdateStatus(cycle.id, 'CLOSED')}
                                >
                                  Close
                                </Button>
                              )}
                              {(cycle.status === 'DRAFT' || cycle.status === 'ARCHIVED') && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDelete(cycle)}
                                  style={{ color: 'var(--color-danger)' }}
                                >
                                  Delete
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Cycle Modal */}
      {isCreateOpen && (
        <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create Planning Cycle">
          <form onSubmit={handleCreate}>
            {modalError && <Alert variant="danger" style={{ marginBottom: 16 }}>{modalError}</Alert>}
            <div style={{ marginBottom: 12 }}>
              <Input
                label="Planning Cycle Name"
                placeholder="e.g. FY2026 Annual Operating Budget"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 4 }}>
                  Planning Type
                </label>
                <select
                  value={formData.planningType}
                  onChange={(e) => setFormData({ ...formData, planningType: e.target.value })}
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
                  {PLANNING_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <Input
                label="Fiscal Year"
                type="number"
                min={2020}
                max={2050}
                required
                value={formData.fiscalYear}
                onChange={(e) => setFormData({ ...formData, fiscalYear: Number(e.target.value) })}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 4 }}>
                  Start Period
                </label>
                <select
                  value={formData.startPeriodId}
                  onChange={(e) => setFormData({ ...formData, startPeriodId: e.target.value })}
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
                  <option value="">Full Year Start</option>
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>{p.periodName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 4 }}>
                  End Period
                </label>
                <select
                  value={formData.endPeriodId}
                  onChange={(e) => setFormData({ ...formData, endPeriodId: e.target.value })}
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
                  <option value="">Full Year End</option>
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>{p.periodName}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <Input
                label="Description"
                placeholder="Optional planning cycle objectives and instructions"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Cycle'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
