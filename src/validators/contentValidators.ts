import { z } from 'zod';
import { objectId, paginationQuery, publishStatus, slug, tagSelection } from './common.js';

export const listContentQuery = paginationQuery.extend({
  status: publishStatus.optional(),
  category: z.string().trim().max(120).optional(),
  country: z.string().trim().max(80).optional(),
  tag: z.string().trim().max(140).optional(),
});

export const createContentSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters').max(240),
  slug: slug.optional(),
  summary: z.string().trim().max(600).optional(),
  body: z.string().max(200_000).optional(),
  featuredImage: objectId.nullish(),
  attachment: objectId.nullish(),
  media: z.array(objectId).max(30).optional(),
  category: z.string().trim().min(1, 'A folder/category is required').max(120),
  country: z.string().trim().max(80).optional(),
  tags: tagSelection,
  status: publishStatus.optional(),
  scheduledFor: z.string().datetime().nullish(),
  order: z.number().int().min(0).max(9999).optional(),
});

export const updateContentSchema = createContentSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Nothing to update' },
);

export const publicDocumentsQuery = z.object({
  country: z.string().trim().max(80).optional(),
  search: z.string().trim().max(200).optional(),
});
