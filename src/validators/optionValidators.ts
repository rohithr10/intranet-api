import { z } from 'zod';
import { objectId, paginationQuery } from './common.js';

const typeEnum = z.enum(['boolean', 'text', 'number', 'select', 'multiselect', 'json']);
const statusEnum = z.enum(['active', 'inactive']);

/** Any JSON value: option values are intentionally polymorphic. */
const jsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValue), z.record(jsonValue)]),
);

export const listOptionsQuery = paginationQuery.extend({
  module: z.string().trim().max(60).optional(),
  type: typeEnum.optional(),
  status: statusEnum.optional(),
});

export const createOptionSchema = z.object({
  name: z.string().trim().min(2).max(120),
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+([._-][a-z0-9]+)*$/, 'Option keys look like "portal.hero_title"')
    .max(80),
  description: z.string().trim().max(400).optional(),
  type: typeEnum,
  defaultValue: jsonValue.optional(),
  value: jsonValue.optional(),
  choices: z
    .array(z.object({ label: z.string().trim().min(1).max(80), value: z.string().trim().min(1).max(80) }))
    .max(50)
    .optional(),
  validation: z
    .object({
      min: z.number().nullish(),
      max: z.number().nullish(),
      pattern: z.string().max(200).nullish(),
      required: z.boolean().optional(),
    })
    .optional(),
  module: z.string().trim().max(60).optional(),
  service: objectId.nullish(),
  editPermission: z.string().trim().max(60).nullish(),
  isPublic: z.boolean().optional(),
  status: statusEnum.optional(),
});

export const updateOptionSchema = createOptionSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Nothing to update' },
);

/** The common case from the admin UI: change one option's value. */
export const setOptionValueSchema = z.object({ value: jsonValue });
