'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          organizationName,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Registration failed');
      }

      router.push('/');
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration error';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        backgroundColor: 'var(--bg-canvas)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 460 }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: 6,
              backgroundColor: 'var(--primary)',
              color: '#FFFFFF',
              fontSize: 18,
              fontWeight: 700,
              marginBottom: 10,
            }}
          >
            Σ
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-heading)', margin: 0 }}>
            Establish Organization Workspace
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, margin: '4px 0 0 0' }}>
            Multi-tenant domain provisioning with administrator authority
          </p>
        </div>

        <Card>
          <CardHeader style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-divider)' }}>
            <div>
              <CardTitle style={{ fontSize: 15 }}>Create Organization &amp; Account</CardTitle>
              <CardDescription>First user receives the Administrator role by default</CardDescription>
            </div>
          </CardHeader>

          <CardContent style={{ padding: 20 }}>
            {error && <Alert type="error">{error}</Alert>}

            <form onSubmit={handleSubmit}>
              <Input
                label="Full Name"
                id="input-name"
                placeholder="Elena Rostova"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />

              <Input
                label="Corporate Email"
                id="input-reg-email"
                type="email"
                placeholder="elena@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              <Input
                label="Organization / Company Name"
                id="input-org-name"
                placeholder="Precision Castings Ltd"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                helperText="Multi-tenant root container for all plants and planning versions"
                required
              />

              <Input
                label="Password (min 8 characters)"
                id="input-reg-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <Button
                type="submit"
                id="btn-submit-register"
                variant="primary"
                isLoading={isLoading}
                style={{ width: '100%', marginTop: 8 }}
              >
                Provision Workspace &amp; Sign In
              </Button>
            </form>
          </CardContent>
        </Card>

        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: 'var(--text-secondary)' }}>
          Already have an account?{' '}
          <Link
            href="/login"
            id="link-login"
            style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}
          >
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
