'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Role } from '@/core/domain/roles';

interface HeaderProps {
  user: {
    id: string;
    email: string;
    name: string;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
  } | null;
  role: Role | string | null;
  onToggleMobileSidebar?: () => void;
}

interface OrgSummary {
  organizationId: string;
  name: string;
  slug: string;
  role: Role;
}

export const Header: React.FC<HeaderProps> = ({ user, organization, role, onToggleMobileSidebar }) => {
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    fetch('/api/organizations')
      .then((res) => res.json())
      .then((data) => {
        if (data.organizations) {
          setOrgs(data.organizations);
        }
      })
      .catch(() => {});
  }, []);

  const handleOrgSwitch = async (targetOrgId: string) => {
    if (targetOrgId === organization?.id) return;
    setIsSwitching(true);
    try {
      const res = await fetch(`/api/organizations/${targetOrgId}/switch`, {
        method: 'POST',
      });
      if (res.ok) {
        window.location.reload();
      }
    } finally {
      setIsSwitching(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <header
      style={{
        height: 60,
        backgroundColor: '#FFFFFF',
        borderBottom: '1px solid var(--border-default)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        position: 'sticky',
        top: 0,
        zIndex: 30,
      }}
    >
      {/* Left: Organization context & optional mobile toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {onToggleMobileSidebar && (
          <button
            onClick={onToggleMobileSidebar}
            aria-label="Toggle navigation menu"
            className="btn btn-ghost btn-sm"
            style={{ padding: 6, height: 32, display: 'none' }}
            id="btn-mobile-sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Organization:
          </span>

          {orgs.length > 1 ? (
            <select
              value={organization?.id || ''}
              disabled={isSwitching}
              onChange={(e) => handleOrgSwitch(e.target.value)}
              className="form-select"
              style={{
                width: 'auto',
                minWidth: 180,
                height: 30,
                fontSize: 12,
                fontWeight: 500,
                padding: '0 24px 0 8px',
                borderColor: 'var(--border-default)',
              }}
            >
              {orgs.map((o) => (
                <option key={o.organizationId} value={o.organizationId}>
                  {o.name}
                </option>
              ))}
            </select>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 600, color: 'var(--text-heading)', fontSize: 13 }}>
                {organization?.name || 'Workspace'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Right: User & sign-out */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-heading)', lineHeight: 1.2 }}>
              {user.name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.2 }}>
              {user.email}
            </div>
          </div>
          {role && <Badge role={role} />}
        </div>

        <button
          onClick={handleLogout}
          className="btn btn-outline btn-sm"
          id="btn-logout"
          title="Sign out of current session"
        >
          Sign Out
        </button>
      </div>
    </header>
  );
};
