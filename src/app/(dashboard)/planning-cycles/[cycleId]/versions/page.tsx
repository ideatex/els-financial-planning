'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
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

interface PlanVersion {
  id: string;
  versionName: string;
  versionCode: string;
  versionType: string;
  description?: string | null;
  scenarioLabel?: string | null;
  baseVersionId?: string | null;
  status: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'LOCKED' | 'ARCHIVED';
  rejectionReason?: string | null;
  submittedDate?: string | null;
  approvedDate?: string | null;
  lockedDate?: string | null;
  createdAt: string;
  owner?: { id: string; name: string; email: string } | null;
  baseVersion?: { id: string; versionCode: string; versionName: string } | null;
  derivedVersions?: { id: string; versionCode: string; versionName: string; status: string }[];
  _count?: { derivedVersions: number };
}

interface PlanningCycle {
  id: string;
  name: string;
  planningType: string;
  fiscalYear: number;
  status: string;
  description?: string | null;
  planVersions: PlanVersion[];
}

interface CurrentUserContext {
  user: { id: string; email: string; name: string };
  organization: { id: string; name: string; slug: string } | null;
  membership: { id: string; role: Role } | null;
}

const VERSION_TYPES = [
  { value: 'BASE_CASE', label: 'Base Case' },
  { value: 'BEST_CASE', label: 'Best Case (Upside)' },
  { value: 'WORST_CASE', label: 'Worst Case (Downside)' },
  { value: 'ORIGINAL_BUDGET', label: 'Original Budget' },
  { value: 'REVISED_BUDGET', label: 'Revised Budget' },
  { value: 'FORECAST', label: 'Forecast' },
  { value: 'MANAGEMENT_SCENARIO', label: 'Management Scenario' },
];

export default function PlanVersionsPage() {
  const params = useParams();
  const cycleId = Array.isArray(params.cycleId) ? params.cycleId[0] : (params.cycleId as string);

  const [context, setContext] = useState<CurrentUserContext | null>(null);
  const [cycle, setCycle] = useState<PlanningCycle | null>(null);
  const [versions, setVersions] = useState<PlanVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formData, setFormData] = useState({
    versionCode: 'V1-BASE',
    versionName: 'Initial Baseline Budget',
    versionType: 'BASE_CASE',
    scenarioLabel: 'Baseline',
    description: '',
    baseVersionId: '',
  });

  const [isBranchOpen, setIsBranchOpen] = useState(false);
  const [branchingSource, setBranchingSource] = useState<PlanVersion | null>(null);
  const [branchData, setBranchData] = useState({
    newVersionCode: '',
    newVersionName: '',
    scenarioLabel: '',
  });

  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [rejectingVersion, setRejectingVersion] = useState<PlanVersion | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const role = context?.membership?.role;
  const canCreate = role ? hasPermission(role, Permissions.PLAN_VERSION_CREATE) : false;
  const canSubmit = role ? hasPermission(role, Permissions.PLAN_VERSION_SUBMIT) : false;
  const canApprove = role ? hasPermission(role, Permissions.PLAN_VERSION_APPROVE) : false;
  const canLock = role ? hasPermission(role, Permissions.PLAN_VERSION_LOCK) : false;

  const loadData = useCallback(async () => {
    if (!cycleId) return;
    setIsLoading(true);
    setError(null);
    try {
      const meRes = await fetch('/api/auth/me');
      if (!meRes.ok) throw new Error('Failed to load session');
      const meData = await meRes.json();
      setContext(meData);

      const [cycleRes, versionsRes] = await Promise.all([
        fetch(`/api/planning/cycles/${cycleId}`),
        fetch(`/api/planning/cycles/${cycleId}/versions`),
      ]);

      if (!cycleRes.ok) throw new Error('Failed to load planning cycle');
      const cycleData = await cycleRes.json();
      setCycle(cycleData.cycle);

      if (!versionsRes.ok) throw new Error('Failed to load plan versions');
      const versionsData = await versionsRes.json();
      setVersions(versionsData.versions);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading plan versions');
    } finally {
      setIsLoading(false);
    }
  }, [cycleId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setModalError(null);
    try {
      const payload = {
        versionCode: formData.versionCode.trim().toUpperCase(),
        versionName: formData.versionName.trim(),
        versionType: formData.versionType,
        scenarioLabel: formData.scenarioLabel.trim() || null,
        description: formData.description.trim() || null,
        baseVersionId: formData.baseVersionId || null,
      };

      const res = await fetch(`/api/planning/cycles/${cycleId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create plan version');

      setIsCreateOpen(false);
      setSuccessMsg(`Plan version ${payload.versionCode} created.`);
      loadData();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Error creating version');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchingSource) return;
    setIsSubmitting(true);
    setModalError(null);
    try {
      const payload = {
        newVersionCode: branchData.newVersionCode.trim().toUpperCase(),
        newVersionName: branchData.newVersionName.trim(),
        scenarioLabel: branchData.scenarioLabel.trim() || null,
      };

      const res = await fetch(`/api/planning/cycles/${cycleId}/versions/${branchingSource.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to branch version');

      setIsBranchOpen(false);
      setSuccessMsg(`Branched new version ${payload.newVersionCode} from ${branchingSource.versionCode}.`);
      loadData();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Error branching version');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (versionId: string, status: string, reason?: string) => {
    try {
      const res = await fetch(`/api/planning/cycles/${cycleId}/versions/${versionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, rejectionReason: reason || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update version status');

      setSuccessMsg(`Version status updated to ${status}.`);
      if (isRejectOpen) setIsRejectOpen(false);
      loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error updating version status');
    }
  };

  const handleDelete = async (v: PlanVersion) => {
    if (!window.confirm(`Are you sure you want to delete version ${v.versionCode}?`)) return;
    try {
      const res = await fetch(`/api/planning/cycles/${cycleId}/versions/${v.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete version');

      setSuccessMsg(`Version ${v.versionCode} deleted.`);
      loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete version');
    }
  };

  const getStatusBadge = (s: string) => {
    switch (s) {
      case 'APPROVED': return <Badge variant="success">Approved</Badge>;
      case 'LOCKED': return <Badge variant="neutral">Locked (Immutable)</Badge>;
      case 'IN_REVIEW': return <Badge variant="warning">In Review</Badge>;
      case 'REJECTED': return <Badge variant="danger">Rejected</Badge>;
      case 'DRAFT': return <Badge variant="neutral">Draft</Badge>;
      default: return <Badge variant="neutral">{s}</Badge>;
    }
  };

  const approvedCount = versions.filter((v) => v.status === 'APPROVED').length;
  const lockedCount = versions.filter((v) => v.status === 'LOCKED').length;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 48 }}>
      {/* Breadcrumb back to planning cycles */}
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/planning-cycles"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '0.875rem',
            color: 'var(--text-secondary)',
            textDecoration: 'none',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to Planning Cycles
        </Link>
      </div>

      <PageHeader
        title={cycle ? `${cycle.name} — Plan Versions` : 'Plan Versions'}
        description={`Governance versions and scenarios for Fiscal Year ${cycle?.fiscalYear || ''}. Strictly audited immutable approval lifecycle.`}
        action={
          canCreate && (
            <Button
              variant="primary"
              onClick={() => {
                const count = versions.length + 1;
                setFormData({
                  versionCode: `V${count}-SCENARIO`,
                  versionName: `Operating Plan Scenario ${count}`,
                  versionType: 'BASE_CASE',
                  scenarioLabel: 'Scenario',
                  description: '',
                  baseVersionId: versions[0]?.id || '',
                });
                setModalError(null);
                setIsCreateOpen(true);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Create Version
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
          label="Total Plan Versions"
          value={versions.length}
          helperText="Scenarios in this cycle"
        />
        <SummaryMetric
          label="Approved Baselines"
          value={approvedCount}
          helperText="Approved by Reviewer/Admin"
        />
        <SummaryMetric
          label="Locked Versions"
          value={lockedCount}
          helperText="Immutable audit frozen"
        />
        <SummaryMetric
          label="Cycle Status"
          value={cycle?.status || 'DRAFT'}
          helperText={`Fiscal Year ${cycle?.fiscalYear || ''}`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Plan Versions & Scenarios</CardTitle>
          <CardDescription>
            Approval state machine: Draft → Review → Approved → Locked. Once approved or locked, versions are immutable.
          </CardDescription>
        </CardHeader>

        <CardContent style={{ padding: 0 }}>
          {isLoading ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
              Loading plan versions...
            </div>
          ) : versions.length === 0 ? (
            <EmptyState
              title="No plan versions exist for this cycle"
              description="Create a base case or branch from an existing budget to begin financial planning."
              action={
                canCreate ? (
                  <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
                    Create Initial Version
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
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Version Name</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Type / Scenario</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Derivation</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Actions & Workflow</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v) => (
                    <tr
                      key={v.id}
                      style={{
                        borderBottom: '1px solid var(--border-default)',
                        transition: 'background-color 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td style={{ padding: '12px 16px', fontWeight: 600, fontFamily: 'monospace' }}>
                        {v.versionCode}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 500 }}>{v.versionName}</div>
                        {v.description && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{v.description}</div>
                        )}
                        {v.rejectionReason && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-danger)', marginTop: 2 }}>
                            Rejection Note: {v.rejectionReason}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          backgroundColor: '#F1F5F9',
                          color: '#334155',
                        }}>
                          {VERSION_TYPES.find((t) => t.value === v.versionType)?.label || v.versionType}
                        </span>
                        {v.scenarioLabel && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                            Label: {v.scenarioLabel}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                        {v.baseVersion ? (
                          <span style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            from {v.baseVersion.versionCode}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.75rem' }}>Primary Origin</span>
                        )}
                        {v._count?.derivedVersions ? (
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-primary)' }}>
                            {v._count.derivedVersions} branch(es)
                          </div>
                        ) : null}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {getStatusBadge(v.status)}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                          {/* Branch button: works from ANY version */}
                          {canCreate && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setBranchingSource(v);
                                setBranchData({
                                  newVersionCode: `${v.versionCode}-B`,
                                  newVersionName: `${v.versionName} (Branch)`,
                                  scenarioLabel: 'Alternate Scenario',
                                });
                                setModalError(null);
                                setIsBranchOpen(true);
                              }}
                            >
                              Branch
                            </Button>
                          )}

                          {/* Submit for review */}
                          {canSubmit && (v.status === 'DRAFT' || v.status === 'REJECTED') && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleUpdateStatus(v.id, 'IN_REVIEW')}
                            >
                              Submit
                            </Button>
                          )}

                          {/* Approve / Reject */}
                          {canApprove && v.status === 'IN_REVIEW' && (
                            <>
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => handleUpdateStatus(v.id, 'APPROVED')}
                              >
                                Approve
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setRejectingVersion(v);
                                  setRejectionReason('');
                                  setModalError(null);
                                  setIsRejectOpen(true);
                                }}
                                style={{ color: 'var(--color-danger)' }}
                              >
                                Reject
                              </Button>
                            </>
                          )}

                          {/* Lock immutable */}
                          {canLock && v.status === 'APPROVED' && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleUpdateStatus(v.id, 'LOCKED')}
                              style={{ color: '#475569' }}
                            >
                              Lock
                            </Button>
                          )}

                          {/* Delete (only Draft / Rejected) */}
                          {canCreate && (v.status === 'DRAFT' || v.status === 'REJECTED') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(v)}
                              style={{ color: 'var(--color-danger)' }}
                            >
                              Delete
                            </Button>
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

      {/* Create Version Modal */}
      {isCreateOpen && (
        <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create Plan Version">
          <form onSubmit={handleCreate}>
            {modalError && <Alert variant="danger" style={{ marginBottom: 16 }}>{modalError}</Alert>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }}>
              <Input
                label="Version Code"
                placeholder="e.g. V1-BASE"
                required
                value={formData.versionCode}
                onChange={(e) => setFormData({ ...formData, versionCode: e.target.value.toUpperCase() })}
              />
              <Input
                label="Version Name"
                placeholder="e.g. 2026 Operating Plan Baseline"
                required
                value={formData.versionName}
                onChange={(e) => setFormData({ ...formData, versionName: e.target.value })}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 4 }}>
                  Version Type
                </label>
                <select
                  value={formData.versionType}
                  onChange={(e) => setFormData({ ...formData, versionType: e.target.value })}
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
                  {VERSION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <Input
                label="Scenario Label"
                placeholder="e.g. Conservative, Upside"
                value={formData.scenarioLabel}
                onChange={(e) => setFormData({ ...formData, scenarioLabel: e.target.value })}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 4 }}>
                Base Version (Optional Branching Source)
              </label>
              <select
                value={formData.baseVersionId}
                onChange={(e) => setFormData({ ...formData, baseVersionId: e.target.value })}
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
                <option value="">None (Standalone Primary Version)</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>{v.versionCode} - {v.versionName}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 20 }}>
              <Input
                label="Description / Scenario Notes"
                placeholder="Assumptions or macroeconomic context"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Version'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Branch Modal */}
      {isBranchOpen && branchingSource && (
        <Modal
          isOpen={isBranchOpen}
          onClose={() => setIsBranchOpen(false)}
          title={`Branch from ${branchingSource.versionCode}`}
        >
          <form onSubmit={handleBranch}>
            {modalError && <Alert variant="danger" style={{ marginBottom: 16 }}>{modalError}</Alert>}
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
              Branching creates an isolated working copy linked to {branchingSource.versionCode} for scenario experimentation.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }}>
              <Input
                label="New Version Code"
                required
                value={branchData.newVersionCode}
                onChange={(e) => setBranchData({ ...branchData, newVersionCode: e.target.value.toUpperCase() })}
              />
              <Input
                label="New Version Name"
                required
                value={branchData.newVersionName}
                onChange={(e) => setBranchData({ ...branchData, newVersionName: e.target.value })}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <Input
                label="Scenario Label"
                value={branchData.scenarioLabel}
                onChange={(e) => setBranchData({ ...branchData, scenarioLabel: e.target.value })}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button type="button" variant="secondary" onClick={() => setIsBranchOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? 'Branching...' : 'Create Branch'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Reject Modal */}
      {isRejectOpen && rejectingVersion && (
        <Modal
          isOpen={isRejectOpen}
          onClose={() => setIsRejectOpen(false)}
          title={`Reject Version (${rejectingVersion.versionCode})`}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!rejectionReason.trim()) {
                setModalError('A rejection reason is required.');
                return;
              }
              handleUpdateStatus(rejectingVersion.id, 'REJECTED', rejectionReason.trim());
            }}
          >
            {modalError && <Alert variant="danger" style={{ marginBottom: 16 }}>{modalError}</Alert>}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 4 }}>
                Reason for Rejection
              </label>
              <textarea
                required
                rows={4}
                placeholder="Explain the required revisions, costing discrepancies, or assumption updates..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--border-default)',
                  fontSize: '0.875rem',
                  outline: 'none',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button type="button" variant="secondary" onClick={() => setIsRejectOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" style={{ backgroundColor: 'var(--color-danger)' }}>
                Confirm Rejection
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
