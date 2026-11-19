import { z } from 'zod';
import { ALL_PERMISSIONS } from '../utils/permissions.js';

const permissionKey = z.enum(ALL_PERMISSIONS as [string, ...string[]]);

export const createRoleSchema = z.object({
  name: z.string().trim().min(2, 'Role name must be at least 2 characters').max(60),
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, 'Role keys may contain lowercase letters, numbers and hyphens')
    .max(40)
    .optional(),
  description: z.string().trim().max(240).optional(),
  permissions: z.array(permissionKey).max(ALL_PERMISSIONS.length).default([]),
});

export const updateRoleSchema = createRoleSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Nothing to update' },
);

export const setPermissionsSchema = z.object({
  permissions: z.array(permissionKey).max(ALL_PERMISSIONS.length),
});
