import { z } from 'zod';
import { objectId, paginationQuery } from './common.js';

const statusEnum = z.enum(['enabled', 'disabled']);
const visibilityEnum = z.enum(['public', 'authenticated', 'restricted']);

export const listServicesQuery = paginationQuery.extend({
  status: statusEnum.optional(),
  tab: z.string().trim().max(60).optional(),
  category: z.string().trim().max(60).optional(),
});

export const createServiceSchema = z.object({
  name: z.string().trim().min(2, 'Service name must be at least 2 characters').max(120),
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, 'Service keys may contain lowercase letters, numbers and hyphens')
    .max(60)
    .optional(),
  description: z.string().trim().max(600).optional(),
  details: z.string().trim().max(4000).optional(),
  features: z.array(z.string().trim().max(240)).max(50).optional(),
  departmentOwner: z.string().trim().max(120).optional(),
  contactEmail: z.string().trim().email('Enter a valid email').max(160).or(z.literal('')).optional(),
  thumbnailUrl: z.string().trim().max(500).optional(),
  /** A lucide-react icon name; the frontend falls back when it cannot resolve it. */
  icon: z.string().trim().max(60).optional(),
  category: z.string().trim().max(60).optional(),
  tab: z.string().trim().max(60).optional(),
  url: z.string().trim().url('Enter a valid URL').max(500).or(z.literal('#')).or(z.literal('')).optional(),
  status: statusEnum.optional(),
  visibility: visibilityEnum.optional(),
  roles: z.array(objectId).max(50).optional(),
  config: z.record(z.unknown()).optional(),
  order: z.number().int().min(0).max(9999).optional(),
});

export const updateServiceSchema = createServiceSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Nothing to update' },
);

export const serviceStatusSchema = z.object({ status: statusEnum });

export const publicServicesQuery = z.object({
  search: z.string().trim().max(200).optional(),
});
