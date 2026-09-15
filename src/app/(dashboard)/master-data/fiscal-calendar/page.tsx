'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SummaryMetric } from '@/components/ui/SummaryMetric';
import { Permissions, hasPermission, Role } from '@/core/domain/roles';

interface FiscalPeriod {
  id: string;
  fiscalYear: number;
  periodNumber: number;
  periodName: string;
  startDate: string;
  endDate: string;
  quarter: number;
  status: 'OPEN' | 'CLOSED' | 'LOCKED';
  closedDate?: string | null;
}

interface FiscalCalendar {
  id: string;
  name: string;
  fiscalYearStartMonth: number;
  calendarType: string;
  status: string;
  periods: FiscalPeriod[];
  _count?: { periods: number };
}

interface CurrentUserContext {
  user: { id: string; email: string; name: string };
  organization: { id: string; name: string; slug: string } | null;
  membership: { id: string; role: Role } | null;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function FiscalCalendarPage() {
  const [context, setContext] = useState<CurrentUserContext | null>(null);
  const [calendars, setCalendars] = useState<FiscalCalendar[]>([]);
  const [selectedCalendar, setSelectedCalendar] = useState<FiscalCalendar | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createData, setCreateData] = useState({
    name: 'Standard Corporate Calendar',
    fiscalYearStartMonth: 1,
    startYear: 2026,
    calendarType: 'MONTHLY' as const,
  });

  const [isAddYearOpen, setIsAddYearOpen] = useState(false);
  const [addYearNum, setAddYearNum] = useState<number>(2027);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const canManage = context?.membership?.role
    ? hasPermission(context.membership.role, Permissions.CALENDAR_MANAGE)
    : false;

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const meRes = await fetch('/api/auth/me');
      if (!meRes.ok) throw new Error('Failed to load session');
      const meData = await meRes.json();
      setContext(meData);

      const res = await fetch('/api/master-data/fiscal-calendar');
      if (!res.ok) throw new Error('Failed to load fiscal calendars');
      const data = await res.json();
      setCalendars(data.calendars);

      if (data.calendars.length > 0) {
        const cal = data.calendars[0];
        setSelectedCalendar(cal);
        if (cal.periods.length > 0) {
          const years = Array.from(new Set(cal.periods.map((p: FiscalPeriod) => p.fiscalYear))) as number[];
          setSelectedYear(years[0] || 2026);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading calendars');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateCalendar = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setModalError(null);
    try {
      const res = await fetch('/api/master-data/fiscal-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create calendar');

      setIsCreateOpen(false);
      setSuccessMsg(`Calendar "${createData.name}" created with 12 sequential monthly periods.`);
      await loadData();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Error creating calendar');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddYear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCalendar) return;
    setIsSubmitting(true);
    setModalError(null);
    try {
      const res = await fetch(`/api/master-data/fiscal-calendar/${selectedCalendar.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fiscalYear: Number(addYearNum) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate fiscal year');

      setIsAddYearOpen(false);
      setSuccessMsg(`12 monthly periods for FY${addYearNum} generated successfully.`);
      setSelectedCalendar(data.calendar);
      setSelectedYear(Number(addYearNum));
      loadData();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Error generating fiscal year');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdatePeriodStatus = async (periodId: string, status: 'OPEN' | 'CLOSED' | 'LOCKED') => {
    try {
      const res = await fetch(`/api/master-data/fiscal-calendar/periods/${periodId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update period status');

      setSuccessMsg(`Period status updated to ${status}.`);
      if (selectedCalendar) {
        const calRes = await fetch(`/api/master-data/fiscal-calendar/${selectedCalendar.id}`);
        if (calRes.ok) {
          const calData = await calRes.json();
          setSelectedCalendar(calData.calendar);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error updating period status');
    }
  };

  const availableYears = selectedCalendar
    ? Array.from(new Set(selectedCalendar.periods.map((p) => p.fiscalYear))).sort((a, b) => a - b)
    : [];

  const displayedPeriods = selectedCalendar
    ? selectedCalendar.periods.filter((p) => p.fiscalYear === selectedYear)
    : [];

  const openPeriodsCount = displayedPeriods.filter((p) => p.status === 'OPEN').length;
  const closedPeriodsCount = displayedPeriods.filter((p) => p.status === 'CLOSED').length;
  const lockedPeriodsCount = displayedPeriods.filter((p) => p.status === 'LOCKED').length;

  const formatDate = (d: string) => {
    return new Date(d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 48 }}>
      <PageHeader
        title="Fiscal Calendar"
        description="Manage fiscal calendars, accounting periods, and period status."
        action={
          canManage && (
            <div style={{ display: 'flex', gap: 8 }}>
              {selectedCalendar && (
                <Button variant="secondary" onClick={() => setIsAddYearOpen(true)}>
                  + Add Fiscal Year
                </Button>
              )}
              <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                New Calendar
              </Button>
            </div>
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
          label="Active Fiscal Year"
          value={`FY${selectedYear}`}
          helperText={`${displayedPeriods.length} monthly periods`}
        />
        <SummaryMetric
          label="Open Periods"
          value={openPeriodsCount}
          helperText="Open for planning and actuals"
        />
        <SummaryMetric
          label="Closed Periods"
          value={closedPeriodsCount}
          helperText="Closed for general entries"
        />
        <SummaryMetric
          label="Locked Periods"
          value={lockedPeriodsCount}
          helperText="Locked for editing"
        />
      </div>

      {selectedCalendar && (
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <CardTitle>{selectedCalendar.name}</CardTitle>
                <CardDescription>
                  Year begins in {MONTH_NAMES[selectedCalendar.fiscalYearStartMonth - 1]} · Standard Monthly Calendar
                </CardDescription>
              </div>

              {/* Year Selector Tabs */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginRight: 4 }}>Fiscal Year:</span>
                {availableYears.map((yr) => (
                  <Button
                    key={yr}
                    variant={selectedYear === yr ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setSelectedYear(yr)}
                  >
                    FY{yr}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>

          <CardContent style={{ padding: 0 }}>
            {isLoading ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
                Loading fiscal periods...
              </div>
            ) : displayedPeriods.length === 0 ? (
              <EmptyState
                title="No periods found"
                description={`No periods generated for Fiscal Year ${selectedYear}.`}
              />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid var(--border-default)' }}>
                      <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Period #</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Period Name</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Quarter</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Start Date</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>End Date</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                      {canManage && <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Controls</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {displayedPeriods.map((period) => (
                      <tr
                        key={period.id}
                        style={{
                          borderBottom: '1px solid var(--border-default)',
                          transition: 'background-color 0.15s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <td style={{ padding: '12px 16px', fontWeight: 600, fontFamily: 'monospace' }}>
                          P{String(period.periodNumber).padStart(2, '0')}
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 500 }}>
                          {period.periodName}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            backgroundColor: '#F1F5F9',
                            color: '#334155',
                          }}>
                            Q{period.quarter}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                          {formatDate(period.startDate)}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                          {formatDate(period.endDate)}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <Badge variant={
                            period.status === 'OPEN' ? 'success' : period.status === 'CLOSED' ? 'warning' : 'neutral'
                          }>
                            {period.status}
                          </Badge>
                        </td>
                        {canManage && (
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              {period.status === 'OPEN' && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleUpdatePeriodStatus(period.id, 'CLOSED')}
                                >
                                  Close Period
                                </Button>
                              )}
                              {period.status === 'CLOSED' && (
                                <>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => handleUpdatePeriodStatus(period.id, 'OPEN')}
                                  >
                                    Reopen
                                  </Button>
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => handleUpdatePeriodStatus(period.id, 'LOCKED')}
                                    style={{ backgroundColor: '#475569' }}
                                  >
                                    Lock Period
                                  </Button>
                                </>
                              )}
                              {period.status === 'LOCKED' && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                  Immutable Lock
                                </span>
                              )}
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
      )}

      {/* Create Calendar Modal */}
      {isCreateOpen && (
        <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create Fiscal Calendar">
          <form onSubmit={handleCreateCalendar}>
            {modalError && <Alert variant="danger" style={{ marginBottom: 16 }}>{modalError}</Alert>}
            <div style={{ marginBottom: 12 }}>
              <Input
                label="Calendar Name"
                placeholder="e.g. Standard Corporate Calendar"
                required
                value={createData.name}
                onChange={(e) => setCreateData({ ...createData, name: e.target.value })}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 4 }}>
                  Fiscal Year Start Month
                </label>
                <select
                  value={createData.fiscalYearStartMonth}
                  onChange={(e) => setCreateData({ ...createData, fiscalYearStartMonth: Number(e.target.value) })}
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
                  {MONTH_NAMES.map((m, idx) => (
                    <option key={idx + 1} value={idx + 1}>{m} (Month {idx + 1})</option>
                  ))}
                </select>
              </div>
              <Input
                label="Initial Fiscal Year"
                type="number"
                min={2020}
                max={2050}
                required
                value={createData.startYear}
                onChange={(e) => setCreateData({ ...createData, startYear: Number(e.target.value) })}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? 'Generating...' : 'Create & Generate Periods'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add Fiscal Year Modal */}
      {isAddYearOpen && selectedCalendar && (
        <Modal isOpen={isAddYearOpen} onClose={() => setIsAddYearOpen(false)} title={`Add Fiscal Year to ${selectedCalendar.name}`}>
          <form onSubmit={handleAddYear}>
            {modalError && <Alert variant="danger" style={{ marginBottom: 16 }}>{modalError}</Alert>}
            <div style={{ marginBottom: 20 }}>
              <Input
                label="Fiscal Year to Generate"
                type="number"
                min={2020}
                max={2050}
                required
                value={addYearNum}
                onChange={(e) => setAddYearNum(Number(e.target.value))}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                This will automatically create 12 sequential monthly periods starting in month {selectedCalendar.fiscalYearStartMonth}.
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button type="button" variant="secondary" onClick={() => setIsAddYearOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? 'Generating...' : 'Generate 12 Periods'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
