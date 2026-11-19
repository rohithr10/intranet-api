import type { CookieOptions, Response } from 'express';
import { env } from '../config/environment.js';
import { ttlToMs } from './jwt.js';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
export const CSRF_COOKIE = 'csrf_token';

function base(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.cookie.secure,
    sameSite: env.cookie.sameSite,
    domain: env.cookie.domain,
    path: '/',
  };
}

/** The CSRF cookie is deliberately readable — the frontend must echo it back. */
export function csrfCookieOptions(): CookieOptions {
  return { ...base(), httpOnly: false, maxAge: ttlToMs(env.jwt.refreshTtl) };
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_COOKIE, accessToken, { ...base(), maxAge: ttlToMs(env.jwt.accessTtl) });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...base(),
    maxAge: ttlToMs(env.jwt.refreshTtl),
    // Scoping the refresh cookie to the auth routes keeps it off every other
    // request, so a single XSS-adjacent leak has less to work with.
    path: '/api/auth',
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { ...base(), maxAge: undefined });
  res.clearCookie(REFRESH_COOKIE, { ...base(), path: '/api/auth', maxAge: undefined });
  res.clearCookie(CSRF_COOKIE, { ...base(), httpOnly: false, maxAge: undefined });
}
