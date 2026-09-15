import React from 'react';
import Link from 'next/link';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
  action?: React.ReactNode;
  badge?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  breadcrumbs,
  actions,
  action,
  badge,
}) => {
  const renderedActions = actions || action;
  return (
    <div style={{ marginBottom: 18 }}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav
          aria-label="Breadcrumbs"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 6,
            fontSize: 12,
            color: 'var(--text-muted)',
          }}
        >
          {breadcrumbs.map((item, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <span style={{ color: 'var(--border-strong)' }}>/</span>}
              {item.href ? (
                <Link
                  href={item.href}
                  style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}
                >
                  {item.label}
                </Link>
              ) : (
                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                  {item.label}
                </span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--text-heading)', letterSpacing: '-0.01em' }}>{title}</h1>
            {badge && <div>{badge}</div>}
          </div>
          {description && (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '3px 0 0 0', lineHeight: 1.4 }}>
              {description}
            </p>
          )}
        </div>

        {renderedActions && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{renderedActions}</div>}
      </div>
    </div>
  );
};
