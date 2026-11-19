import { z } from 'zod';
import { booleanFlag, paginationQuery } from './common.js';

export const listMediaQuery = paginationQuery.extend({
  mimeType: z.string().trim().max(120).optional(),
  folder: z.string().trim().max(60).optional(),
});

/** Multipart text fields arrive as strings, so this schema stays string-only. */
export const uploadMediaSchema = z.object({
  alt: z.string().trim().max(240).optional(),
  folder: z.string().trim().max(60).optional(),
});

export const updateMediaSchema = uploadMediaSchema.refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Nothing to update' },
);

export const deleteMediaQuery = z.object({ force: booleanFlag.default(false) });
