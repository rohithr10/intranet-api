import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { ACCESS_COOKIE } from '../utils/cookies.js';
import { loadAuthContext } from '../services/authService.js';

/** Reads the access token from the httpOnly cookie, falling back to a Bearer
 *  header so the API stays usable from scripts, tests and native clients. */
function extractToken(req: Request): string | null {
  const cookieToken = (req.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE];
  if (cookieToken) return cookieToken;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

/**
 * Requires a valid session and attaches `req.auth`.
 *
 * The token is only an identity assertion: the role and its permissions are
 * re-read from the database on every request, so revoking a permission or
 * deactivating an account takes effect immediately rather than when the token
 * happens to expire.
 */
export const authenticate = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const token = extractToken(req);
  if (!token) return next(ApiError.unauthorized('Authentication required'));

  const claims = verifyAccessToken(token);
  const context = await loadAuthContext(claims);
  req.auth = context;
  return next();
});

/** Attaches `req.auth` when a valid session exists, but never rejects. */
export const optionalAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const token = extractToken(req);
  if (!token) return next();
  try {
    req.auth = await loadAuthContext(verifyAccessToken(token));
  } catch {
    /* treated as anonymous */
  }
  return next();
});
