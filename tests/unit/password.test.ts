import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/password';

describe('Password Hashing & Verification', () => {
  it('hashes a valid password and produces a bcrypt hash', async () => {
    const raw = 'SecretP@ssw0rd!';
    const hash = await hashPassword(raw);

    expect(hash).toBeDefined();
    expect(hash.startsWith('$2a$') || hash.startsWith('$2b$')).toBe(true);
    expect(hash).not.toBe(raw);
  });

  it('correctly verifies matching password against hash', async () => {
    const raw = 'CorrectHorseBatteryStaple123';
    const hash = await hashPassword(raw);

    const isMatch = await verifyPassword(raw, hash);
    expect(isMatch).toBe(true);
  });

  it('rejects incorrect password against hash', async () => {
    const raw = 'CorrectHorseBatteryStaple123';
    const hash = await hashPassword(raw);

    const isMatch = await verifyPassword('WrongPassword!', hash);
    expect(isMatch).toBe(false);
  });

  it('throws error for password under 8 characters', async () => {
    await expect(hashPassword('short')).rejects.toThrow('at least 8 characters');
  });

  it('handles empty inputs safely during verification', async () => {
    expect(await verifyPassword('', 'somehash')).toBe(false);
    expect(await verifyPassword('password', '')).toBe(false);
  });
});
