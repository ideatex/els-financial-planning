import { z } from 'zod';
import { Roles } from '@/core/domain/roles';

export const createOrganizationSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters long').max(100).trim(),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers, and hyphens')
    .trim(),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const addMemberSchema = z.object({
  email: z.string().email('Please provide a valid email address').toLowerCase().trim(),
  role: z.enum([Roles.ADMIN, Roles.PLANNER, Roles.REVIEWER], {
    errorMap: () => ({ message: 'Role must be ADMIN, PLANNER, or REVIEWER' }),
  }),
  name: z.string().min(2, 'Name must be at least 2 characters long').optional(),
});

export type AddMemberInput = z.infer<typeof addMemberSchema>;

export const updateMemberRoleSchema = z.object({
  role: z.enum([Roles.ADMIN, Roles.PLANNER, Roles.REVIEWER], {
    errorMap: () => ({ message: 'Role must be ADMIN, PLANNER, or REVIEWER' }),
  }),
});

export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
