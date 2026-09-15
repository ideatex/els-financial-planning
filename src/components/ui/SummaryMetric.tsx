import React from 'react';

export interface SummaryMetricProps {
  label: string;
  value: React.ReactNode;
  subtext?: string;
  helperText?: string;
  badge?: React.ReactNode;
  className?: string;
}

export const SummaryMetric: React.FC<SummaryMetricProps> = ({
  label,
  value,
  subtext,
  helperText,
  badge,
  className = '',
}) => {
  const displayedSubtext = subtext || helperText;
  return (
    <div
      className={`card ${className}`}
      style={{
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: '#FFFFFF',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-xs)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
          {label}
        </span>
        {badge && <div>{badge}</div>}
      </div>

      <div style={{ marginTop: 8 }}>
        <div
          className="tabular-nums"
          style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-heading)', lineHeight: 1.2 }}
        >
          {value}
        </div>
        {displayedSubtext && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            {displayedSubtext}
          </div>
        )}
      </div>
    </div>
  );
};
