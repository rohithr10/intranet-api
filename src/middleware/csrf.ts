import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError.js';
import { CSRF_COOKIE, csrfCookieOptions } from '../utils/cookies.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_HEADER = 'x-csrf-token';

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Issues the readable CSRF cookie that pairs with the httpOnly session cookie. */
export function issueCsrfCookie(res: Response): string {
  const token = generateCsrfToken();
  res.cookie(CSRF_COOKIE, token, csrfCookieOptions());
  return token;
}

/**
 * Double-submit CSRF check for cookie-authenticated writes.
 *
 * The browser sends the cookie automatically; a cross-site attacker cannot read
 * it to copy into the header, so requiring both proves the request came from our
 * own frontend. Bearer-token clients are exempt — a token is not auto-attached,
 * so there is nothing for a third-party site to abuse.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();

  const usesCookieAuth = Boolean((req.cookies as Record<string, string> | undefined)?.access_token);
  if (!usesCookieAuth) return next();

  const cookieToken = (req.cookies as Record<string, string> | undefined)?.[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER];
  const provided = Array.isArray(headerToken) ? headerToken[0] : headerToken;

  if (!cookieToken || !provided || !timingSafeEqual(cookieToken, provided)) {
    return next(ApiError.forbidden('Invalid or missing CSRF token', { code: 'CSRF_FAILED' }));
  }
  return next();
}

function timingSafeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}
