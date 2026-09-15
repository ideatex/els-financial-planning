'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';

interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export default function AuditTrailPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  const fetchLogs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/audit');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to load audit trail');
      }
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error fetching audit logs';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div>
      <PageHeader
        title="Audit Trail"
        description="Audit logs of system actions, changes, and authentication events."
        breadcrumbs={[
          { label: 'Overview', href: '/' },
          { label: 'Administration' },
          { label: 'Audit Trail' },
        ]}
        actions={
          <Button variant="secondary" size="sm" onClick={fetchLogs} isLoading={isLoading}>
            Refresh
          </Button>
        }
      />

      {error && <Alert type="error">{error}</Alert>}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Audit Logs ({logs.length})</CardTitle>
            <CardDescription>
              Ordered chronologically by timestamp (most recent first)
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent style={{ padding: 0 }}>
          {isLoading ? (
            <div style={{ padding: 36, textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading audit records...
            </div>
          ) : logs.length === 0 ? (
            <EmptyState
              title="No audit events found"
              description="Organizational actions will be logged here automatically."
            />
          ) : (
            <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
              <table className="table" id="table-audit">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Action</th>
                    <th>Entity Type</th>
                    <th>Actor</th>
                    <th style={{ textAlign: 'right' }}>Metadata Payload</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
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
                        {log.entityType} {log.entityId ? `(${log.entityId.substring(0, 8)}...)` : ''}
                      </td>
                      <td>
                        {log.actor ? (
                          <div>
                            <div style={{ fontWeight: 500, color: 'var(--text-heading)' }}>{log.actor.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{log.actor.email}</div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>System</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {log.metadata ? (
                          <button
                            onClick={() => setSelectedLog(selectedLog?.id === log.id ? null : log)}
                            className="btn btn-outline btn-sm"
                            style={{ fontSize: 11, height: 26, padding: '0 8px' }}
                          >
                            {selectedLog?.id === log.id ? 'Hide Details' : 'View Details'}
                          </button>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>None</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Clean Light-Theme Metadata Inspector */}
      {selectedLog && (
        <Card style={{ marginTop: 20 }}>
          <CardHeader>
            <div>
              <CardTitle>Event Payload Inspector — {selectedLog.action}</CardTitle>
              <CardDescription>Event Reference: {selectedLog.id}</CardDescription>
            </div>
            <button
              onClick={() => setSelectedLog(null)}
              className="btn btn-ghost btn-sm"
              style={{ padding: '2px 8px' }}
              aria-label="Close inspector"
            >
              ✕
            </button>
          </CardHeader>
          <CardContent style={{ padding: 16 }}>
            <pre
              style={{
                backgroundColor: 'var(--bg-subtle)',
                padding: 14,
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-heading)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                overflowX: 'auto',
                lineHeight: 1.5,
              }}
            >
              {JSON.stringify(selectedLog.metadata, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
