'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Role, Roles, hasPermission, Permissions } from '@/core/domain/roles';

interface SidebarProps {
  role?: Role | string | null;
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ role, isOpen = true, onClose }) => {
  const pathname = usePathname();

  const navItems = [
    {
      group: 'WORKSPACE',
      items: [
        {
          label: 'Overview',
          href: '/',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
          ),
          show: true,
        },
        {
          label: 'Planning Cycles',
          href: '/planning-cycles',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          ),
          show: hasPermission(role as Role, Permissions.PLAN_VIEW),
        },
        {
          label: 'Financial Plans',
          href: '/plans',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 20h20M5 20V8l5 4V8l5 4V4h5v16" />
            </svg>
          ),
          show: true,
        },
        {
          label: 'Calculation Engine',
          href: '/calculations',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="2" width="16" height="20" rx="2" />
              <line x1="8" y1="6" x2="16" y2="6" />
              <line x1="16" y1="14" x2="16" y2="14.01" />
              <line x1="12" y1="14" x2="12" y2="14.01" />
              <line x1="8" y1="14" x2="8" y2="14.01" />
              <line x1="16" y1="18" x2="16" y2="18.01" />
              <line x1="12" y1="18" x2="12" y2="18.01" />
              <line x1="8" y1="18" x2="8" y2="18.01" />
              <line x1="8" y1="10" x2="16" y2="10" />
            </svg>
          ),
          show: hasPermission(role as Role, Permissions.PLAN_VIEW),
        },
      ],
    },
    {
      group: 'PLANNING & TARGETS',
      items: [
        {
          label: 'Planning Inputs',
          href: '/planning-inputs',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
            </svg>
          ),
          show: hasPermission(role as Role, Permissions.PLAN_INPUTS_VIEW),
        },
        {
          label: 'Management Targets',
          href: '/targets',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="6" />
              <circle cx="12" cy="12" r="2" />
            </svg>
          ),
          show: hasPermission(role as Role, Permissions.TARGETS_MANAGE) || hasPermission(role as Role, Permissions.TARGETS_APPROVE) || hasPermission(role as Role, Permissions.PLAN_VIEW),
        },
        {
          label: 'Assumptions',
          href: '/assumptions',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
          ),
          show: hasPermission(role as Role, Permissions.ASSUMPTIONS_MANAGE) || hasPermission(role as Role, Permissions.PLAN_VIEW),
        },
        {
          label: 'Planning Drivers',
          href: '/drivers',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          ),
          show: hasPermission(role as Role, Permissions.DRIVERS_MANAGE) || hasPermission(role as Role, Permissions.PLAN_VIEW),
        },
      ],
    },
    {
      group: 'ACTUALS & REPORTING',
      items: [
        {
          label: 'Actuals Management',
          href: '/actuals',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          ),
          show: hasPermission(role as Role, Permissions.ACTUALS_VIEW),
        },
        {
          label: 'Variance Analysis',
          href: '/variance',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          ),
          show: hasPermission(role as Role, Permissions.VARIANCE_VIEW),
        },
        {
          label: 'Financial Reports',
          href: '/reports',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          ),
          show: hasPermission(role as Role, Permissions.REPORTS_VIEW),
        },
      ],
    },
    {
      group: 'FORECASTING & SCENARIOS',
      items: [
        {
          label: 'Forecast Versions',
          href: '/forecasts',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </svg>
          ),
          show: hasPermission(role as Role, Permissions.FORECAST_VIEW),
        },
        {
          label: 'Rolling Forecasts',
          href: '/forecasts/rolling',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
          ),
          show: hasPermission(role as Role, Permissions.FORECAST_VIEW),
        },
        {
          label: 'Scenarios & What-If',
          href: '/scenarios',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
          ),
          show: hasPermission(role as Role, Permissions.FORECAST_VIEW) || hasPermission(role as Role, Permissions.SCENARIO_MANAGE),
        },
        {
          label: 'Compare Forecasts',
          href: '/forecasts/compare',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="18" rx="1" />
              <rect x="14" y="3" width="7" height="18" rx="1" />
            </svg>
          ),
          show: hasPermission(role as Role, Permissions.FORECAST_VIEW),
        },
      ],
    },
    {
      group: 'MASTER DATA',
      items: [
        {
          label: 'Plants',
          href: '/master-data/plants',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 20h20M3 20V8l7 4V4l10 6v10" />
            </svg>
          ),
          show: hasPermission(role as Role, Permissions.MASTER_DATA_VIEW),
        },
        {
          label: 'Products',
          href: '/master-data/products',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          ),
          show: hasPermission(role as Role, Permissions.MASTER_DATA_VIEW),
        },
        {
          label: 'Materials',
          href: '/master-data/materials',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
          ),
          show: hasPermission(role as Role, Permissions.MASTER_DATA_VIEW),
        },
        {
          label: 'Bills of Materials',
          href: '/master-data/boms',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
          ),
          show: hasPermission(role as Role, Permissions.MASTER_DATA_VIEW),
        },
        {
          label: 'Routings & Operations',
          href: '/master-data/routings',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="6" r="3" />
              <path d="M6 15v-3a6 6 0 0 1 6-6h3" />
            </svg>
          ),
          show: hasPermission(role as Role, Permissions.MASTER_DATA_VIEW),
        },
        {
          label: 'Chart of Accounts',
          href: '/master-data/chart-of-accounts',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          ),
          show: hasPermission(role as Role, Permissions.MASTER_DATA_VIEW),
        },
        {
          label: 'Fiscal Calendar',
          href: '/master-data/fiscal-calendar',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          ),
          show: hasPermission(role as Role, Permissions.MASTER_DATA_VIEW),
        },
      ],
    },
    {
      group: 'ADMINISTRATION',
      items: [
        {
          label: 'Team & RBAC',
          href: '/organization/members',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          ),
          show: true,
        },
        {
          label: 'Audit Trail',
          href: '/audit',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          ),
          show: hasPermission(role as Role, Permissions.ORG_VIEW_AUDIT),
        },
      ],
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="sidebar-mobile-backdrop"
          onClick={onClose}
          style={{
            display: 'none',
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
            zIndex: 40,
          }}
        />
      )}

      <aside
        className={isOpen ? 'mobile-open' : ''}
        style={{
          width: 240,
          backgroundColor: '#FFFFFF',
          borderRight: '1px solid var(--border-default)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          height: '100vh',
          position: 'sticky',
          top: 0,
          zIndex: 45,
        }}
      >
        {/* Brand Header */}
        <div
          style={{
            height: 60,
            padding: '0 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            borderBottom: '1px solid var(--border-divider)',
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 4,
              backgroundColor: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 14,
              color: '#FFFFFF',
            }}
          >
            Σ
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-heading)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
              ELS Financial
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.2 }}>
              Manufacturing FP&amp;A
            </div>
          </div>
        </div>

        {/* Navigation Groups */}
        <div style={{ padding: '16px 10px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {navItems.map((group) => {
            const visibleItems = group.items.filter((item) => item.show);
            if (visibleItems.length === 0) return null;

            return (
              <div key={group.group}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    color: 'var(--text-muted)',
                    padding: '0 10px 6px',
                  }}
                >
                  {group.group}
                </div>
                <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {visibleItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 10px',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: 13,
                          fontWeight: isActive ? 600 : 500,
                          color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                          backgroundColor: isActive ? 'var(--bg-active)' : 'transparent',
                          borderLeft: isActive ? '3px solid var(--primary)' : '3px solid transparent',
                          textDecoration: 'none',
                          transition: 'all 0.1s ease',
                        }}
                      >
                        <span
                          style={{
                            color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          {item.icon}
                        </span>
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </nav>
              </div>
            );
          })}
        </div>

        {/* Footer Status */}
        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid var(--border-divider)',
            backgroundColor: 'var(--bg-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: 'var(--success-text)',
            }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            Deterministic Engine Active
          </span>
        </div>
      </aside>
    </>
  );
};
