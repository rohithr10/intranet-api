import { z } from 'zod';
import { booleanFlag, objectId, paginationQuery, publishStatus, slug, tagSelection } from './common.js';

const scopeEnum = z.enum(['Global', 'Local']);

export const listNewsQuery = paginationQuery.extend({
  status: publishStatus.optional(),
  scope: scopeEnum.optional(),
  category: z.string().trim().max(60).optional(),
  tag: z.string().trim().max(140).optional(),
  featured: booleanFlag.optional(),
});

export const createNewsSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters').max(240),
  slug: slug.optional(),
  summary: z.string().trim().max(600).optional(),
  body: z.string().max(200_000).optional(),
  featuredImage: objectId.nullish(),
  images: z.array(objectId).max(30).optional(),
  category: z.string().trim().max(60).optional(),
  scope: scopeEnum.optional(),
  tags: tagSelection,
  status: publishStatus.optional(),
  scheduledFor: z.string().datetime().nullish(),
  seoTitle: z.string().trim().max(160).optional(),
  seoDescription: z.string().trim().max(320).optional(),
  isFeatured: z.boolean().optional(),
});

export const updateNewsSchema = createNewsSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Nothing to update' },
);

export const publicNewsQuery = paginationQuery.extend({
  scope: scopeEnum.optional(),
  category: z.string().trim().max(60).optional(),
  tag: z.string().trim().max(140).optional(),
  featured: booleanFlag.optional(),
});

export const slugParam = z.object({ slug: z.string().trim().min(1).max(140) });
