import React from 'react';

export interface EmptyStateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, description, action, icon, actionLabel, onAction }) => {
  return (
    <div
      style={{
        padding: '48px 24px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          backgroundColor: 'var(--bg-subtle)',
          border: '1px solid var(--border-default)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          marginBottom: 12,
        }}
      >
        {icon || (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        )}
      </div>
      <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-heading)', margin: 0 }}>
        {title}
      </h4>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, maxWidth: 360, margin: '4px 0 0 0' }}>
        {description}
      </p>
      {action ? (
        <div style={{ marginTop: 16 }}>{action}</div>
      ) : actionLabel && onAction ? (
        <div style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-primary" onClick={onAction}>
            {actionLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
};
