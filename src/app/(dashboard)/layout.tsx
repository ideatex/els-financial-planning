import React from 'react';
import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/session';
import { AppShell } from '@/components/layout/AppShell';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getSessionContext();

  if (!context) {
    redirect('/login');
  }

  return (
    <AppShell
      user={context.user}
      organization={context.organization}
      role={context.membership?.role || null}
    >
      {children}
    </AppShell>
  );
}
