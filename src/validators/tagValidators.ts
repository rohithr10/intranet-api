import { z } from 'zod';
import { booleanFlag, paginationQuery, slug } from './common.js';

const statusEnum = z.enum(['active', 'inactive']);

export const listTagsQuery = paginationQuery.extend({
  status: statusEnum.optional(),
  withCounts: booleanFlag.default(true),
});

export const createTagSchema = z.object({
  name: z.string().trim().min(1, 'A tag name is required').max(60),
  slug: slug.optional(),
  description: z.string().trim().max(240).optional(),
  color: z
    .string()
    .trim()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Colour must be a hex value like #a3e635')
    .nullish(),
  status: statusEnum.optional(),
});

export const updateTagSchema = createTagSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Nothing to update' },
);
