import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError.js';
import type { PermissionKey } from '../utils/permissions.js';

/**
 * Permission gate. Default-deny: without `req.auth` the request is rejected,
 * and a user needs *every* listed permission to pass.
 *
 * This is the only authorization decision point that matters. The frontend
 * hides buttons it should not show, but each protected route re-checks here.
 */
export function authorize(...required: PermissionKey[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const auth = req.auth;
    if (!auth) return next(ApiError.unauthorized('Authentication required'));
    if (auth.isSuperAdmin) return next();

    const missing = required.filter((permission) => !auth.permissions.has(permission));
    if (missing.length > 0) {
      return next(
        ApiError.forbidden('You do not have permission to perform this action', {
          details: { required, missing },
        }),
      );
    }
    return next();
  };
}

/** Passes when the user holds at least one of the listed permissions. */
export function authorizeAny(...accepted: PermissionKey[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const auth = req.auth;
    if (!auth) return next(ApiError.unauthorized('Authentication required'));
    if (auth.isSuperAdmin) return next();
    if (accepted.some((permission) => auth.permissions.has(permission))) return next();
    return next(
      ApiError.forbidden('You do not have permission to perform this action', {
        details: { requiredAnyOf: accepted },
      }),
    );
  };
}

export function has(req: Request, permission: PermissionKey): boolean {
  return Boolean(req.auth?.isSuperAdmin || req.auth?.permissions.has(permission));
}
