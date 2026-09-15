'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Roles } from '@/core/domain/roles';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Invalid email or password');
      }

      router.push('/');
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid email or password';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('Password123!');
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
      <div style={{ width: '100%', maxWidth: 420 }}>
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
            ELS Financial Planning
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, margin: '4px 0 0 0' }}>
            Manufacturing Financial Planning &amp; Analysis
          </p>
        </div>

        <Card>
          <CardHeader style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-divider)' }}>
            <div>
              <CardTitle style={{ fontSize: 15 }}>Sign In</CardTitle>
              <CardDescription>Enter corporate credentials to access your workspace</CardDescription>
            </div>
          </CardHeader>

          <CardContent style={{ padding: 20 }}>
            {error && <Alert type="error">{error}</Alert>}

            <form onSubmit={handleSubmit}>
              <Input
                label="Corporate Email"
                id="input-email"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              <Input
                label="Password"
                id="input-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <Button
                type="submit"
                id="btn-submit-login"
                variant="primary"
                isLoading={isLoading}
                style={{ width: '100%', marginTop: 6 }}
              >
                Sign In
              </Button>
            </form>

            {/* Seeded Demo Account Selectors */}
            <div
              style={{
                marginTop: 20,
                paddingTop: 16,
                borderTop: '1px solid var(--border-divider)',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  letterSpacing: '0.04em',
                  marginBottom: 8,
                }}
              >
                Test Accounts (Pre-configured)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                <button
                  type="button"
                  id="btn-demo-admin"
                  onClick={() => handleQuickLogin('admin@precisionmfg.com')}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: 11, padding: '0 4px' }}
                >
                  <Badge role={Roles.ADMIN} />
                </button>
                <button
                  type="button"
                  id="btn-demo-planner"
                  onClick={() => handleQuickLogin('planner@precisionmfg.com')}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: 11, padding: '0 4px' }}
                >
                  <Badge role={Roles.PLANNER} />
                </button>
                <button
                  type="button"
                  id="btn-demo-reviewer"
                  onClick={() => handleQuickLogin('reviewer@precisionmfg.com')}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: 11, padding: '0 4px' }}
                >
                  <Badge role={Roles.REVIEWER} />
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: 'var(--text-secondary)' }}>
          Need to create a new organization?{' '}
          <Link
            href="/register"
            id="link-register"
            style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}
          >
            Register Organization
          </Link>
        </div>
      </div>
    </div>
  );
}
