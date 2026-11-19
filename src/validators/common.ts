import { z } from 'zod';

export const objectId = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Not a valid identifier');

export const idParam = z.object({ id: objectId });

/** Shared list query: page/limit coerced from strings, with sane ceilings. */
export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
});

export const booleanFlag = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => (typeof value === 'boolean' ? value : value === 'true'));

/** Passwords: length does more for strength than exotic character rules, but a
 *  mix is still required so a 10-character dictionary word does not pass. */
export const password = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine((value) => /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value), {
    message: 'Password must include an uppercase letter, a lowercase letter and a number',
  });

export const email = z.string().trim().toLowerCase().email('Enter a valid email address');

export const tagSelection = z
  .object({
    ids: z.array(objectId).max(30).optional(),
    newNames: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  })
  .optional();

export const publishStatus = z.enum(['draft', 'scheduled', 'published', 'archived']);

export const publishActionBody = z.object({
  action: z.enum(['publish', 'unpublish', 'schedule', 'archive']),
  scheduledFor: z.string().datetime().nullish(),
});

export const slug = z
  .string()
  .trim()
  .min(1)
  .max(140)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slugs may contain lowercase letters, numbers and hyphens');
