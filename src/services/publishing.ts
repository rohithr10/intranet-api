import type { Request } from 'express';
import { ApiError } from '../utils/ApiError.js';
import type { PublishStatus } from '../types/domain.js';
import type { PermissionKey } from '../utils/permissions.js';

/** Statuses a visitor may see. Scheduled items appear once their time passes. */
export function publicFilter(now: Date = new Date()): Record<string, unknown> {
  return {
    $or: [
      { status: 'published', publishedAt: { $lte: now } },
      { status: 'published', publishedAt: null },
      { status: 'scheduled', scheduledFor: { $lte: now } },
    ],
  };
}

export interface PublishTransition {
  status: PublishStatus;
  publishedAt: Date | null;
  scheduledFor: Date | null;
}

/**
 * Works out the stored dates for a requested publication state and refuses the
 * transition when the caller lacks the publish permission — a Content Manager
 * or Editor without it can save drafts all day but cannot make them live.
 */
export function resolvePublishTransition(
  req: Request,
  action: 'publish' | 'unpublish' | 'schedule' | 'archive',
  publishPermission: PermissionKey,
  scheduledFor?: string | Date | null,
): PublishTransition {
  const auth = req.auth;
  if (!auth) throw ApiError.unauthorized();
  if (!auth.isSuperAdmin && !auth.permissions.has(publishPermission)) {
    throw ApiError.forbidden('You do not have permission to change publication status');
  }

  switch (action) {
    case 'publish':
      return { status: 'published', publishedAt: new Date(), scheduledFor: null };
    case 'unpublish':
      return { status: 'draft', publishedAt: null, scheduledFor: null };
    case 'archive':
      return { status: 'archived', publishedAt: null, scheduledFor: null };
    case 'schedule': {
      if (!scheduledFor) throw ApiError.badRequest('A publication date is required', { field: 'scheduledFor' });
      const when = new Date(scheduledFor);
      if (Number.isNaN(when.getTime())) {
        throw ApiError.badRequest('That publication date is not valid', { field: 'scheduledFor' });
      }
      if (when.getTime() <= Date.now()) {
        throw ApiError.badRequest('Scheduled publication must be in the future', { field: 'scheduledFor' });
      }
      return { status: 'scheduled', publishedAt: null, scheduledFor: when };
    }
    default:
      throw ApiError.badRequest('Unsupported publication action');
  }
}

/**
 * Guards the status field on create/update. Anything that would make an item
 * publicly visible needs the publish permission; drafts do not.
 */
export function assertStatusAllowed(
  req: Request,
  status: PublishStatus | undefined,
  publishPermission: PermissionKey,
): void {
  if (!status || status === 'draft') return;
  const auth = req.auth;
  if (!auth) throw ApiError.unauthorized();
  if (auth.isSuperAdmin || auth.permissions.has(publishPermission)) return;
  throw ApiError.forbidden('You can save a draft, but publishing requires additional permission', {
    code: 'PUBLISH_FORBIDDEN',
  });
}
