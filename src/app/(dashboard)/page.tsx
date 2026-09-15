import React from 'react';
import Link from 'next/link';
import { getSessionContext } from '@/lib/session';
import { db } from '@/lib/db';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { SummaryMetric } from '@/components/ui/SummaryMetric';
import { EmptyState } from '@/components/ui/EmptyState';
import { ROLE_PERMISSIONS, Role, Roles } from '@/core/domain/roles';

export default async function DashboardPage() {
  const context = await getSessionContext();
  const orgId = context?.organization?.id;
  const userRole = (context?.membership?.role || Roles.REVIEWER) as Role;

  const [memberCount, auditCount, cycleCount, recentLogs] = await Promise.all([
    orgId ? db.membership.count({ where: { organizationId: orgId } }) : 0,
    orgId ? db.auditLog.count({ where: { organizationId: orgId } }) : 0,
    orgId ? db.planningCycle.count({ where: { organizationId: orgId } }) : 0,
    orgId
      ? db.auditLog.findMany({
          where: { organizationId: orgId },
          orderBy: { createdAt: 'desc' },
          take: 8,
          include: {
            user: { select: { name: true, email: true } },
          },
        })
      : [],
  ]);

  return (
    <div>
      <PageHeader
        title="Overview"
        description={context?.organization?.name || 'Financial Planning'}
        badge={<Badge role={userRole} />}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/plans" className="btn btn-primary btn-sm">
              Financial Plans
            </Link>
            <Link href="/planning-cycles" className="btn btn-secondary btn-sm">
              Planning Cycles
            </Link>
          </div>
        }
      />

      {/* Summary Metrics */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <SummaryMetric
          label="Planning Cycles"
          value={cycleCount}
          subtext="Active budgets & forecasts"
        />
        <SummaryMetric
          label="Team Members"
          value={memberCount}
        />
        <SummaryMetric
          label="Audit Events"
          value={auditCount}
        />
        <SummaryMetric
          label="Your Role"
          value={userRole}
          badge={<Badge role={userRole} />}
        />
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          {userRole === 'ADMIN' && (
            <Link href="/audit" className="btn btn-outline btn-sm">
              View All
            </Link>
          )}
        </CardHeader>
        <CardContent style={{ padding: 0 }}>
          {recentLogs.length === 0 ? (
            <EmptyState
              title="No activity yet"
              description="Actions performed by team members will appear here."
            />
          ) : (
            <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>User</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="tabular-nums" style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 6px',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: 11,
                            fontWeight: 600,
                            fontFamily: 'var(--font-mono)',
                            backgroundColor: 'var(--bg-subtle)',
                            color: 'var(--text-heading)',
                            border: '1px solid var(--border-default)',
                          }}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {log.entityType} {log.entityId ? `(${log.entityId.substring(0, 8)}…)` : ''}
                      </td>
                      <td style={{ fontWeight: 500, color: 'var(--text-heading)' }}>
                        {log.user?.name || 'System'}
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
