import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { registerUser, loginUser, logoutUser } from '@/server/services/auth.service';
import { getSessionContext } from '@/lib/session';
import { ConflictError, UnauthorizedError } from '@/core/errors/AppError';
import { Roles } from '@/core/domain/roles';

describe('Auth Service Integration', () => {
  const testEmail = `test-${Date.now()}@testcorp.com`;
  const testPassword = 'SecurePassword123!';
  const testOrgName = 'Precision Test Corp';

  it('registers a new user and automatically establishes an organization with ADMIN membership', async () => {
    const result = await registerUser({
      email: testEmail,
      password: testPassword,
      name: 'Integration Tester',
      organizationName: testOrgName,
    });

    expect(result.user.id).toBeDefined();
    expect(result.user.email).toBe(testEmail);
    expect(result.organization.name).toBe(testOrgName);
    expect(result.membership.role).toBe(Roles.ADMIN);
    expect(result.sessionToken).toBeDefined();

    // Verify session context retrieval
    const context = await getSessionContext(result.sessionToken);
    expect(context).not.toBeNull();
    expect(context?.user.id).toBe(result.user.id);
    expect(context?.membership?.role).toBe(Roles.ADMIN);
    expect(context?.organization?.name).toBe(testOrgName);
  });

  it('prevents registering a duplicate email address', async () => {
    await expect(
      registerUser({
        email: testEmail,
        password: testPassword,
        name: 'Duplicate Tester',
        organizationName: 'Another Corp',
      })
    ).rejects.toThrow(ConflictError);
  });

  it('logs in an existing user with correct credentials and creates a valid session', async () => {
    const loginResult = await loginUser({
      email: testEmail,
      password: testPassword,
    });

    expect(loginResult.user.email).toBe(testEmail);
    expect(loginResult.sessionToken).toBeDefined();
    expect(loginResult.membership?.role).toBe(Roles.ADMIN);

    const context = await getSessionContext(loginResult.sessionToken);
    expect(context?.user.email).toBe(testEmail);
  });

  it('rejects login attempts with incorrect passwords', async () => {
    await expect(
      loginUser({
        email: testEmail,
        password: 'WrongPassword!',
      })
    ).rejects.toThrow(UnauthorizedError);
  });

  it('rejects login attempts for non-existent users', async () => {
    await expect(
      loginUser({
        email: 'ghost@nonexistent.com',
        password: testPassword,
      })
    ).rejects.toThrow(UnauthorizedError);
  });

  it('invalidates a session on logout', async () => {
    const loginResult = await loginUser({
      email: testEmail,
      password: testPassword,
    });

    await logoutUser(loginResult.sessionToken);

    const contextAfterLogout = await getSessionContext(loginResult.sessionToken);
    expect(contextAfterLogout).toBeNull();
  });
});
