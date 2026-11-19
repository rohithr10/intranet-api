import { z } from 'zod';
import { objectId, paginationQuery } from './common.js';

export const listActivityQuery = paginationQuery.extend({
  action: z.string().trim().max(80).optional(),
  entity: z.string().trim().max(60).optional(),
  actor: objectId.optional(),
  status: z.enum(['success', 'failure']).optional(),
});
