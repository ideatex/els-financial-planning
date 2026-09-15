import { describe, it, expect } from 'vitest';
import { db } from '@/lib/db';
import { registerUser } from '@/server/services/auth.service';
import {
  getUserOrganizations,
  createOrganization,
  getOrganizationMembers,
  addMemberToOrganization,
  updateMemberRole,
  removeMemberFromOrganization,
} from '@/server/services/organization.service';
import { getOrganizationAuditLogs } from '@/server/services/audit.service';
import { Roles } from '@/core/domain/roles';
import { ValidationError, ConflictError } from '@/core/errors/AppError';

describe('Organization & Membership RBAC Integration', () => {
  let adminUserId: string;
  let organizationId: string;

  it('sets up a primary organization with an admin', async () => {
    const timestamp = Date.now();
    const reg = await registerUser({
      email: `admin-${timestamp}@orgtest.com`,
      password: 'AdminPassword123!',
      name: 'Primary Admin',
      organizationName: `Apex Manufacturing ${timestamp}`,
    });

    adminUserId = reg.user.id;
    organizationId = reg.organization.id;

    expect(adminUserId).toBeDefined();
    expect(organizationId).toBeDefined();

    const orgs = await getUserOrganizations(adminUserId);
    expect(orgs.length).toBeGreaterThanOrEqual(1);
    expect(orgs.some((o) => o.organizationId === organizationId)).toBe(true);
  });

  it('allows admin to add a new member with PLANNER role', async () => {
    const plannerEmail = `planner-${Date.now()}@orgtest.com`;
    const newMember = await addMemberToOrganization(adminUserId, organizationId, {
      email: plannerEmail,
      name: 'Line Planner',
      role: Roles.PLANNER,
    });

    expect(newMember.email).toBe(plannerEmail);
    expect(newMember.role).toBe(Roles.PLANNER);

    const members = await getOrganizationMembers(organizationId);
    const found = members.find((m) => m.email === plannerEmail);
    expect(found).toBeDefined();
    expect(found?.role).toBe(Roles.PLANNER);
  });

  it('allows admin to add a new member with REVIEWER role', async () => {
    const reviewerEmail = `reviewer-${Date.now()}@orgtest.com`;
    const newMember = await addMemberToOrganization(adminUserId, organizationId, {
      email: reviewerEmail,
      name: 'Financial Auditor',
      role: Roles.REVIEWER,
    });

    expect(newMember.role).toBe(Roles.REVIEWER);
  });

  it('prevents adding the same member twice to the same organization', async () => {
    const dupeEmail = `dupe-${Date.now()}@orgtest.com`;
    await addMemberToOrganization(adminUserId, organizationId, {
      email: dupeEmail,
      name: 'Dupe User',
      role: Roles.PLANNER,
    });

    await expect(
      addMemberToOrganization(adminUserId, organizationId, {
        email: dupeEmail,
        name: 'Dupe User',
        role: Roles.PLANNER,
      })
    ).rejects.toThrow(ConflictError);
  });

  it('allows admin to update a member role', async () => {
    const promoteEmail = `promote-${Date.now()}@orgtest.com`;
    const member = await addMemberToOrganization(adminUserId, organizationId, {
      email: promoteEmail,
      name: 'Promote Me',
      role: Roles.PLANNER,
    });

    const updated = await updateMemberRole(adminUserId, organizationId, member.userId, Roles.REVIEWER);
    expect(updated.role).toBe(Roles.REVIEWER);
  });

  it('prevents demoting the sole administrator of an organization', async () => {
    // Attempt to demote adminUserId when they are the only admin
    await expect(
      updateMemberRole(adminUserId, organizationId, adminUserId, Roles.PLANNER)
    ).rejects.toThrow(ValidationError);
  });

  it('prevents removing the sole administrator of an organization', async () => {
    await expect(
      removeMemberFromOrganization(adminUserId, organizationId, adminUserId)
    ).rejects.toThrow(ValidationError);
  });

  it('records audit events for member actions and queries audit logs successfully', async () => {
    const logs = await getOrganizationAuditLogs(organizationId);
    expect(logs.length).toBeGreaterThan(0);
    const actions = logs.map((l) => l.action);
    expect(actions).toContain('MEMBER_ADDED');
  });
});
