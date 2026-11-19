import { z } from 'zod';
import { booleanFlag, email, objectId, paginationQuery, password } from './common.js';

const statusEnum = z.enum(['active', 'inactive', 'suspended']);

export const listUsersQuery = paginationQuery.extend({
  status: statusEnum.optional(),
  role: objectId.optional(),
  sort: z.enum(['name', 'recent']).optional(),
});

export const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  email,
  password,
  role: objectId,
  status: statusEnum.default('active'),
  department: z.string().trim().max(120).optional(),
  country: z.string().trim().max(80).optional(),
  jobTitle: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  showInDirectory: z.boolean().optional(),
  mustChangePassword: z.boolean().optional(),
});

export const updateUserSchema = createUserSchema
  .partial()
  .extend({ password: password.optional() })
  .refine((data) => Object.keys(data).length > 0, { message: 'Nothing to update' });

export const directoryQuery = z.object({
  search: z.string().trim().max(120).optional(),
  field: z.enum(['name', 'department', 'country']).default('name'),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const assignRoleSchema = z.object({ role: objectId });

export { booleanFlag };
