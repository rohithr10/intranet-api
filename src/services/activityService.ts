import type { Request } from 'express';
import { ActivityLog } from '../models/ActivityLog.js';
import { logger } from '../utils/logger.js';

interface ActivityInput {
  action: string;
  entity?: string;
  entityId?: string;
  description?: string;
  meta?: Record<string, unknown>;
  status?: 'success' | 'failure';
  actorId?: string | null;
  actorEmail?: string;
}

/**
 * Appends an audit entry. Deliberately fire-and-forget: a logging failure must
 * never turn a successful administrative action into a 500 for the user, so the
 * error is logged and swallowed.
 */
export async function recordActivity(req: Request, input: ActivityInput): Promise<void> {
  try {
    await ActivityLog.create({
      actor: input.actorId ?? req.auth?.userId ?? null,
      actorEmail: input.actorEmail ?? req.auth?.email ?? '',
      action: input.action,
      entity: input.entity ?? '',
      entityId: input.entityId ?? '',
      description: input.description ?? '',
      meta: input.meta ?? {},
      status: input.status ?? 'success',
      ip: req.ip ?? '',
      userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300),
    });
  } catch (err) {
    logger.error('Failed to write activity log', err);
  }
}

export async function listActivity(filter: {
  page: number;
  limit: number;
  action?: string;
  entity?: string;
  actor?: string;
  status?: 'success' | 'failure';
}) {
  const query: Record<string, unknown> = {};
  if (filter.action) query.action = filter.action;
  if (filter.entity) query.entity = filter.entity;
  if (filter.actor) query.actor = filter.actor;
  if (filter.status) query.status = filter.status;

  const [items, total] = await Promise.all([
    ActivityLog.find(query)
      .populate('actor', 'name email')
      .sort({ createdAt: -1 })
      .skip((filter.page - 1) * filter.limit)
      .limit(filter.limit)
      .lean(),
    ActivityLog.countDocuments(query),
  ]);

  return { items, total };
}
