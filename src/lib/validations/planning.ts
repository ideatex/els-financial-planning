import { z } from 'zod';

export const PlanningTypes = [
  'ANNUAL_BUDGET',
  'ROLLING_FORECAST',
  'MONTHLY_FORECAST',
  'SCENARIO_PLAN',
] as const;

export const PlanningCycleStatuses = [
  'DRAFT',
  'OPEN',
  'IN_REVIEW',
  'APPROVED',
  'CLOSED',
  'ARCHIVED',
] as const;

export const createPlanningCycleSchema = z.object({
  name: z.string().min(2, 'Cycle name must be at least 2 characters').max(100).trim(),
  planningType: z.enum(PlanningTypes),
  fiscalYear: z.number().int().min(2020).max(2050),
  startPeriodId: z.string().optional().nullable(),
  endPeriodId: z.string().optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  ownerUserId: z.string().optional().nullable(),
});

export const updatePlanningCycleSchema = createPlanningCycleSchema.partial();

export const updatePlanningCycleStatusSchema = z.object({
  status: z.enum(PlanningCycleStatuses),
});

export const VersionTypes = [
  'ORIGINAL_BUDGET',
  'REVISED_BUDGET',
  'FORECAST',
  'BEST_CASE',
  'BASE_CASE',
  'WORST_CASE',
  'MANAGEMENT_SCENARIO',
] as const;

export const PlanVersionStatuses = [
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'LOCKED',
  'ARCHIVED',
] as const;

export const createPlanVersionSchema = z.object({
  versionName: z.string().min(2, 'Version name must be at least 2 characters').max(100).trim(),
  versionCode: z
    .string()
    .min(2, 'Version code must be at least 2 characters')
    .max(20)
    .regex(/^[A-Za-z0-9-_.]+$/, 'Version code can only contain letters, numbers, hyphens, periods')
    .toUpperCase()
    .trim(),
  versionType: z.enum(VersionTypes),
  description: z.string().max(500).optional().nullable(),
  scenarioLabel: z.string().max(50).optional().nullable(),
  baseVersionId: z.string().optional().nullable(),
  ownerUserId: z.string().optional().nullable(),
});

export const updatePlanVersionSchema = createPlanVersionSchema.partial().omit({ versionCode: true });

export const updatePlanVersionStatusSchema = z.object({
  status: z.enum(PlanVersionStatuses),
  rejectionReason: z.string().max(500).optional().nullable(),
}).refine(
  (data) => {
    if (data.status === 'REJECTED') {
      return !!data.rejectionReason && data.rejectionReason.trim().length > 0;
    }
    return true;
  },
  {
    message: 'A rejection reason is required when rejecting a plan version',
    path: ['rejectionReason'],
  }
);

export const duplicatePlanVersionSchema = z.object({
  newVersionName: z.string().min(2).max(100).trim(),
  newVersionCode: z.string().min(2).max(20).toUpperCase().trim(),
  scenarioLabel: z.string().max(50).optional().nullable(),
});
