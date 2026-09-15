'use client';

import React, { useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { Role } from '@/core/domain/roles';

interface AppShellProps {
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
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ user, organization, role, children }) => {
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <div className="app-shell">
      {/* Mobile backdrop */}
      {isMobileOpen && (
        <div
          onClick={() => setIsMobileOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
            zIndex: 40,
          }}
        />
      )}

      <div className={isMobileOpen ? 'mobile-open' : ''}>
        <Sidebar
          role={role}
          isOpen={isMobileOpen}
          onClose={() => setIsMobileOpen(false)}
        />
      </div>

      <div className="main-area">
        <Header
          user={user}
          organization={organization}
          role={role}
          onToggleMobileSidebar={() => setIsMobileOpen((prev) => !prev)}
        />
        <main className="page-container">{children}</main>
      </div>
    </div>
  );
};
