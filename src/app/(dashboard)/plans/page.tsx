'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { SummaryMetric } from '@/components/ui/SummaryMetric';

interface PlanVersion {
  id: string;
  versionCode: string;
  versionName: string;
  status: string;
  createdAt: string;
  planningCycle: {
    id: string;
    name: string;
    fiscalYear: number;
    planningType: string;
    status: string;
  };
}

export default function PlansPage() {
  const [versions, setVersions] = useState<PlanVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadVersions() {
      setLoading(true);
      try {
        const cyclesRes = await fetch('/api/planning/cycles');
        if (!cyclesRes.ok) throw new Error('Failed to load planning data');
        const data = await cyclesRes.json();
        const cycles = data.cycles || [];

        const allVersions: PlanVersion[] = [];
        for (const cycle of cycles) {
          if (cycle.planVersions) {
            for (const v of cycle.planVersions) {
              allVersions.push({
                ...v,
                planningCycle: {
                  id: cycle.id,
                  name: cycle.name,
                  fiscalYear: cycle.fiscalYear,
                  planningType: cycle.planningType,
                  status: cycle.status,
                },
              });
            }
          }
        }

        setVersions(allVersions);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadVersions();
  }, []);

  const getStatusVariant = (s: string) => {
    switch (s) {
      case 'APPROVED': return 'success';
      case 'IN_REVIEW': return 'warning';
      case 'LOCKED': return 'primary';
      case 'DRAFT': return 'neutral';
      default: return 'neutral';
    }
  };

  const draftCount = versions.filter(v => v.status === 'DRAFT').length;
  const approvedCount = versions.filter(v => v.status === 'APPROVED' || v.status === 'LOCKED').length;

  return (
    <div>
      <PageHeader
        title="Financial Plans"
        description="Plan versions across all planning cycles"
        actions={
          <Link href="/planning-cycles" className="btn btn-primary btn-sm">
            Manage Planning Cycles
          </Link>
        }
      />

      {/* Summary */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <SummaryMetric label="Total Versions" value={versions.length} />
        <SummaryMetric label="Draft" value={draftCount} />
        <SummaryMetric label="Approved / Locked" value={approvedCount} />
      </div>

      {/* Versions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Plan Versions</CardTitle>
        </CardHeader>
        <CardContent style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
              Loading plan versions…
            </div>
          ) : error ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-danger)' }}>
              {error}
            </div>
          ) : versions.length === 0 ? (
            <EmptyState
              title="No plan versions"
              description="Create a planning cycle to begin building financial plans."
              actionLabel="Go to Planning Cycles"
              onAction={() => window.location.href = '/planning-cycles'}
            />
          ) : (
            <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Planning Cycle</th>
                    <th>Type</th>
                    <th>Fiscal Year</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-heading)' }}>
                          {v.versionCode}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {v.versionName}
                        </div>
                      </td>
                      <td>
                        <Link
                          href={`/planning-cycles/${v.planningCycle.id}/versions`}
                          style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 500 }}
                        >
                          {v.planningCycle.name}
                        </Link>
                      </td>
                      <td>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 500,
                            backgroundColor: '#EFF6FF',
                            color: '#1D4ED8',
                          }}
                        >
                          {v.planningCycle.planningType.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="tabular-nums" style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                        FY{v.planningCycle.fiscalYear}
                      </td>
                      <td>
                        <Badge variant={getStatusVariant(v.status)}>
                          {v.status}
                        </Badge>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <Link href={`/planning-cycles/${v.planningCycle.id}/versions`}>
                            <Button variant="secondary" size="sm">
                              View
                            </Button>
                          </Link>
                          <Link href="/calculations">
                            <Button variant="outline" size="sm">
                              Calculate
                            </Button>
                          </Link>
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
    </div>
  );
}
