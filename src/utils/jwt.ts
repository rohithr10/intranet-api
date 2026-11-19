import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/environment.js';
import { ApiError } from './ApiError.js';
import type { AccessTokenClaims, RefreshTokenClaims } from '../types/domain.js';

export function signAccessToken(claims: Omit<AccessTokenClaims, 'type'>): string {
  return jwt.sign({ ...claims, type: 'access' }, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessTtl,
  } as SignOptions);
}

export function signRefreshToken(claims: Omit<RefreshTokenClaims, 'type'>): string {
  return jwt.sign({ ...claims, type: 'refresh' }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshTtl,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  const payload = verify(token, env.jwt.accessSecret);
  if (payload.type !== 'access') {
    throw ApiError.unauthorized('Invalid token type', { code: 'TOKEN_INVALID' });
  }
  return payload as unknown as AccessTokenClaims;
}

export function verifyRefreshToken(token: string): RefreshTokenClaims {
  const payload = verify(token, env.jwt.refreshSecret);
  if (payload.type !== 'refresh') {
    throw ApiError.unauthorized('Invalid token type', { code: 'TOKEN_INVALID' });
  }
  return payload as unknown as RefreshTokenClaims;
}

function verify(token: string, secret: string): jwt.JwtPayload & { type?: string } {
  try {
    const decoded = jwt.verify(token, secret);
    if (typeof decoded === 'string') {
      throw ApiError.unauthorized('Invalid token', { code: 'TOKEN_INVALID' });
    }
    return decoded as jwt.JwtPayload & { type?: string };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized('Session expired', { code: 'TOKEN_EXPIRED' });
    }
    throw ApiError.unauthorized('Invalid or expired token', { code: 'TOKEN_INVALID' });
  }
}

/** Milliseconds for a `15m` / `7d` style duration — used for cookie maxAge. */
export function ttlToMs(ttl: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)$/i.exec(ttl.trim());
  if (!match) return 15 * 60 * 1000;
  const value = Number(match[1]);
  const unit = (match[2] ?? 'm').toLowerCase();
  const factors: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * (factors[unit] ?? 60_000);
}
