import { describe, it, expect } from 'vitest';
import { Roles, Permissions, hasPermission, isValidRole } from '@/core/domain/roles';

describe('RBAC Role & Permission Matrix', () => {
  describe('Role Validation', () => {
    it('validates recognized roles', () => {
      expect(isValidRole('ADMIN')).toBe(true);
      expect(isValidRole('PLANNER')).toBe(true);
      expect(isValidRole('REVIEWER')).toBe(true);
    });

    it('rejects unrecognized roles', () => {
      expect(isValidRole('SUPERUSER')).toBe(false);
      expect(isValidRole('GUEST')).toBe(false);
      expect(isValidRole('')).toBe(false);
    });
  });

  describe('ADMIN Role Permissions', () => {
    it('grants administrative permissions to ADMIN', () => {
      expect(hasPermission(Roles.ADMIN, Permissions.ORG_MANAGE_SETTINGS)).toBe(true);
      expect(hasPermission(Roles.ADMIN, Permissions.ORG_MANAGE_MEMBERS)).toBe(true);
      expect(hasPermission(Roles.ADMIN, Permissions.ORG_VIEW_AUDIT)).toBe(true);
    });

    it('grants planning and review permissions to ADMIN', () => {
      expect(hasPermission(Roles.ADMIN, Permissions.PLAN_CREATE)).toBe(true);
      expect(hasPermission(Roles.ADMIN, Permissions.PLAN_EDIT)).toBe(true);
      expect(hasPermission(Roles.ADMIN, Permissions.PLAN_CALCULATE)).toBe(true);
      expect(hasPermission(Roles.ADMIN, Permissions.PLAN_APPROVE)).toBe(true);
      expect(hasPermission(Roles.ADMIN, Permissions.PLAN_LOCK)).toBe(true);
    });
  });

  describe('PLANNER Role Permissions', () => {
    it('grants plan creation, editing, calculation, and review submission to PLANNER', () => {
      expect(hasPermission(Roles.PLANNER, Permissions.PLAN_CREATE)).toBe(true);
      expect(hasPermission(Roles.PLANNER, Permissions.PLAN_EDIT)).toBe(true);
      expect(hasPermission(Roles.PLANNER, Permissions.PLAN_CALCULATE)).toBe(true);
      expect(hasPermission(Roles.PLANNER, Permissions.PLAN_SUBMIT_REVIEW)).toBe(true);
      expect(hasPermission(Roles.PLANNER, Permissions.PLAN_VIEW)).toBe(true);
      expect(hasPermission(Roles.PLANNER, Permissions.PLAN_EXPORT)).toBe(true);
    });

    it('denies administrative and approval permissions to PLANNER', () => {
      expect(hasPermission(Roles.PLANNER, Permissions.ORG_MANAGE_SETTINGS)).toBe(false);
      expect(hasPermission(Roles.PLANNER, Permissions.ORG_MANAGE_MEMBERS)).toBe(false);
      expect(hasPermission(Roles.PLANNER, Permissions.ORG_VIEW_AUDIT)).toBe(false);
      expect(hasPermission(Roles.PLANNER, Permissions.PLAN_APPROVE)).toBe(false);
      expect(hasPermission(Roles.PLANNER, Permissions.PLAN_LOCK)).toBe(false);
    });
  });

  describe('REVIEWER Role Permissions', () => {
    it('grants approval, locking, viewing, and exporting to REVIEWER', () => {
      expect(hasPermission(Roles.REVIEWER, Permissions.PLAN_APPROVE)).toBe(true);
      expect(hasPermission(Roles.REVIEWER, Permissions.PLAN_LOCK)).toBe(true);
      expect(hasPermission(Roles.REVIEWER, Permissions.PLAN_VIEW)).toBe(true);
      expect(hasPermission(Roles.REVIEWER, Permissions.PLAN_EXPORT)).toBe(true);
    });

    it('denies plan authoring, editing, and calculation to REVIEWER', () => {
      expect(hasPermission(Roles.REVIEWER, Permissions.PLAN_CREATE)).toBe(false);
      expect(hasPermission(Roles.REVIEWER, Permissions.PLAN_EDIT)).toBe(false);
      expect(hasPermission(Roles.REVIEWER, Permissions.PLAN_CALCULATE)).toBe(false);
      expect(hasPermission(Roles.REVIEWER, Permissions.PLAN_SUBMIT_REVIEW)).toBe(false);
    });

    it('denies administrative member management to REVIEWER', () => {
      expect(hasPermission(Roles.REVIEWER, Permissions.ORG_MANAGE_MEMBERS)).toBe(false);
      expect(hasPermission(Roles.REVIEWER, Permissions.ORG_VIEW_AUDIT)).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('returns false for null or undefined roles', () => {
      expect(hasPermission(null, Permissions.PLAN_VIEW)).toBe(false);
      expect(hasPermission(undefined, Permissions.PLAN_VIEW)).toBe(false);
    });
  });
});
