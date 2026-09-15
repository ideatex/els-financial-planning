/**
 * Role-Based Access Control (RBAC) definitions
 * Strictly enforces organizational privileges across Admin, Planner, and Reviewer.
 * Phase 1: Authentication, Organizations, Membership, Audit
 * Phase 2: Master Data (Plants, Products, Materials, BOM, Routing, COA, Calendar) and Planning Foundations
 */

export const Roles = {
  ADMIN: 'ADMIN',
  PLANNER: 'PLANNER',
  REVIEWER: 'REVIEWER',
} as const;

export type Role = (typeof Roles)[keyof typeof Roles];

export const Permissions = {
  // Organization & Administration
  ORG_MANAGE_SETTINGS: 'ORG_MANAGE_SETTINGS',
  ORG_MANAGE_MEMBERS: 'ORG_MANAGE_MEMBERS',
  ORG_VIEW_AUDIT: 'ORG_VIEW_AUDIT',

  // Master Data Management
  MASTER_DATA_VIEW: 'MASTER_DATA_VIEW',
  MASTER_DATA_MANAGE: 'MASTER_DATA_MANAGE',
  CALENDAR_MANAGE: 'CALENDAR_MANAGE',

  // Planning Governance & Cycles
  PLAN_CYCLE_MANAGE: 'PLAN_CYCLE_MANAGE',
  PLAN_VERSION_CREATE: 'PLAN_VERSION_CREATE',
  PLAN_VERSION_SUBMIT: 'PLAN_VERSION_SUBMIT',
  PLAN_VERSION_APPROVE: 'PLAN_VERSION_APPROVE',
  PLAN_VERSION_LOCK: 'PLAN_VERSION_LOCK',

  // Planning Scenarios & Execution
  PLAN_CREATE: 'PLAN_CREATE',
  PLAN_EDIT: 'PLAN_EDIT',
  PLAN_CALCULATE: 'PLAN_CALCULATE',
  PLAN_SUBMIT_REVIEW: 'PLAN_SUBMIT_REVIEW',
  PLAN_APPROVE: 'PLAN_APPROVE',
  PLAN_LOCK: 'PLAN_LOCK',
  PLAN_VIEW: 'PLAN_VIEW',
  PLAN_EXPORT: 'PLAN_EXPORT',

  // Phase 3: Targets, Assumptions, Drivers & Planning Inputs
  TARGETS_MANAGE: 'TARGETS_MANAGE',
  TARGETS_APPROVE: 'TARGETS_APPROVE',
  ASSUMPTIONS_MANAGE: 'ASSUMPTIONS_MANAGE',
  DRIVERS_MANAGE: 'DRIVERS_MANAGE',
  PLAN_INPUTS_VIEW: 'PLAN_INPUTS_VIEW',
  PLAN_INPUTS_EDIT: 'PLAN_INPUTS_EDIT',
  VERSION_COPY: 'VERSION_COPY',
  VERSION_COMPARE: 'VERSION_COMPARE',

  // Phase 5: Actuals, Reconciliation, Variance & Reporting
  ACTUALS_VIEW: 'ACTUALS_VIEW',
  ACTUALS_UPLOAD: 'ACTUALS_UPLOAD',
  ACTUALS_VALIDATE: 'ACTUALS_VALIDATE',
  ACTUALS_IMPORT: 'ACTUALS_IMPORT',
  ACTUALS_REVIEW: 'ACTUALS_REVIEW',
  ACTUALS_LOCK: 'ACTUALS_LOCK',
  ACTUALS_REVERSE: 'ACTUALS_REVERSE',
  ACTUALS_EXPORT: 'ACTUALS_EXPORT',
  RECONCILIATION_VIEW: 'RECONCILIATION_VIEW',
  VARIANCE_VIEW: 'VARIANCE_VIEW',
  VARIANCE_COMMENT: 'VARIANCE_COMMENT',
  VARIANCE_RESOLVE: 'VARIANCE_RESOLVE',
  REPORTS_VIEW: 'REPORTS_VIEW',
  REPORTS_EXPORT: 'REPORTS_EXPORT',

  // Phase 6: Forecasting, Rolling Forecasts, Scenarios & What-If
  FORECAST_VIEW: 'FORECAST_VIEW',
  FORECAST_CREATE: 'FORECAST_CREATE',
  FORECAST_EDIT: 'FORECAST_EDIT',
  FORECAST_CALCULATE: 'FORECAST_CALCULATE',
  FORECAST_SUBMIT: 'FORECAST_SUBMIT',
  FORECAST_APPROVE: 'FORECAST_APPROVE',
  FORECAST_PUBLISH: 'FORECAST_PUBLISH',
  FORECAST_LOCK: 'FORECAST_LOCK',
  FORECAST_SUPERSEDE: 'FORECAST_SUPERSEDE',
  FORECAST_EXPORT: 'FORECAST_EXPORT',
  SCENARIO_MANAGE: 'SCENARIO_MANAGE',
  WHAT_IF_EXECUTE: 'WHAT_IF_EXECUTE',
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  [Roles.ADMIN]: [
    Permissions.ORG_MANAGE_SETTINGS,
    Permissions.ORG_MANAGE_MEMBERS,
    Permissions.ORG_VIEW_AUDIT,
    Permissions.MASTER_DATA_VIEW,
    Permissions.MASTER_DATA_MANAGE,
    Permissions.CALENDAR_MANAGE,
    Permissions.PLAN_CYCLE_MANAGE,
    Permissions.PLAN_VERSION_CREATE,
    Permissions.PLAN_VERSION_SUBMIT,
    Permissions.PLAN_VERSION_APPROVE,
    Permissions.PLAN_VERSION_LOCK,
    Permissions.PLAN_CREATE,
    Permissions.PLAN_EDIT,
    Permissions.PLAN_CALCULATE,
    Permissions.PLAN_SUBMIT_REVIEW,
    Permissions.PLAN_APPROVE,
    Permissions.PLAN_LOCK,
    Permissions.PLAN_VIEW,
    Permissions.PLAN_EXPORT,
    Permissions.TARGETS_MANAGE,
    Permissions.TARGETS_APPROVE,
    Permissions.ASSUMPTIONS_MANAGE,
    Permissions.DRIVERS_MANAGE,
    Permissions.PLAN_INPUTS_VIEW,
    Permissions.PLAN_INPUTS_EDIT,
    Permissions.VERSION_COPY,
    Permissions.VERSION_COMPARE,
    Permissions.ACTUALS_VIEW,
    Permissions.ACTUALS_UPLOAD,
    Permissions.ACTUALS_VALIDATE,
    Permissions.ACTUALS_IMPORT,
    Permissions.ACTUALS_REVIEW,
    Permissions.ACTUALS_LOCK,
    Permissions.ACTUALS_REVERSE,
    Permissions.ACTUALS_EXPORT,
    Permissions.RECONCILIATION_VIEW,
    Permissions.VARIANCE_VIEW,
    Permissions.VARIANCE_COMMENT,
    Permissions.VARIANCE_RESOLVE,
    Permissions.REPORTS_VIEW,
    Permissions.REPORTS_EXPORT,
    Permissions.FORECAST_VIEW,
    Permissions.FORECAST_CREATE,
    Permissions.FORECAST_EDIT,
    Permissions.FORECAST_CALCULATE,
    Permissions.FORECAST_SUBMIT,
    Permissions.FORECAST_APPROVE,
    Permissions.FORECAST_PUBLISH,
    Permissions.FORECAST_LOCK,
    Permissions.FORECAST_SUPERSEDE,
    Permissions.FORECAST_EXPORT,
    Permissions.SCENARIO_MANAGE,
    Permissions.WHAT_IF_EXECUTE,
  ],
  [Roles.PLANNER]: [
    Permissions.MASTER_DATA_VIEW,
    Permissions.MASTER_DATA_MANAGE,
    Permissions.PLAN_CYCLE_MANAGE,
    Permissions.PLAN_VERSION_CREATE,
    Permissions.PLAN_VERSION_SUBMIT,
    Permissions.PLAN_CREATE,
    Permissions.PLAN_EDIT,
    Permissions.PLAN_CALCULATE,
    Permissions.PLAN_SUBMIT_REVIEW,
    Permissions.PLAN_VIEW,
    Permissions.PLAN_EXPORT,
    Permissions.TARGETS_MANAGE,
    Permissions.ASSUMPTIONS_MANAGE,
    Permissions.DRIVERS_MANAGE,
    Permissions.PLAN_INPUTS_VIEW,
    Permissions.PLAN_INPUTS_EDIT,
    Permissions.VERSION_COPY,
    Permissions.VERSION_COMPARE,
    Permissions.ACTUALS_VIEW,
    Permissions.ACTUALS_UPLOAD,
    Permissions.ACTUALS_VALIDATE,
    Permissions.ACTUALS_IMPORT,
    Permissions.ACTUALS_EXPORT,
    Permissions.RECONCILIATION_VIEW,
    Permissions.VARIANCE_VIEW,
    Permissions.VARIANCE_COMMENT,
    Permissions.REPORTS_VIEW,
    Permissions.REPORTS_EXPORT,
    Permissions.FORECAST_VIEW,
    Permissions.FORECAST_CREATE,
    Permissions.FORECAST_EDIT,
    Permissions.FORECAST_CALCULATE,
    Permissions.FORECAST_SUBMIT,
    Permissions.FORECAST_EXPORT,
    Permissions.SCENARIO_MANAGE,
    Permissions.WHAT_IF_EXECUTE,
  ],
  [Roles.REVIEWER]: [
    Permissions.MASTER_DATA_VIEW,
    Permissions.PLAN_VERSION_APPROVE,
    Permissions.PLAN_VERSION_LOCK,
    Permissions.PLAN_APPROVE,
    Permissions.PLAN_LOCK,
    Permissions.PLAN_VIEW,
    Permissions.PLAN_EXPORT,
    Permissions.TARGETS_APPROVE,
    Permissions.PLAN_INPUTS_VIEW,
    Permissions.VERSION_COMPARE,
    Permissions.ACTUALS_VIEW,
    Permissions.ACTUALS_REVIEW,
    Permissions.ACTUALS_LOCK,
    Permissions.ACTUALS_REVERSE,
    Permissions.ACTUALS_EXPORT,
    Permissions.RECONCILIATION_VIEW,
    Permissions.VARIANCE_VIEW,
    Permissions.VARIANCE_COMMENT,
    Permissions.VARIANCE_RESOLVE,
    Permissions.REPORTS_VIEW,
    Permissions.REPORTS_EXPORT,
    Permissions.FORECAST_VIEW,
    Permissions.FORECAST_APPROVE,
    Permissions.FORECAST_PUBLISH,
    Permissions.FORECAST_LOCK,
    Permissions.FORECAST_SUPERSEDE,
    Permissions.FORECAST_EXPORT,
    Permissions.SCENARIO_MANAGE,
  ],
};

export function hasPermission(role: Role | string | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  const permissions = ROLE_PERMISSIONS[role as Role];
  if (!permissions) return false;
  return permissions.includes(permission);
}

export function isValidRole(role: string): role is Role {
  return Object.values(Roles).includes(role as Role);
}
