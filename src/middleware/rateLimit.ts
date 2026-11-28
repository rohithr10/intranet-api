import type { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/environment.js';

const disabled = env.isTest;

/** General API ceiling — generous enough for a dashboard that polls. */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => disabled,
  message: { success: false, message: 'Too many requests, please try again later' },
});

/**
 * Sign-in attempts keyed by email as well as IP: an IP-only limiter cannot stop
 * a password-spray spread across addresses, and an office behind one NAT
 * address should not lock out everybody.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => disabled,
  keyGenerator: (req: Request) => {
    const email = (req.body as { email?: unknown } | undefined)?.email;
    return typeof email === 'string' && email ? `email:${email.trim().toLowerCase()}` : `ip:${req.ip}`;
  },
  message: {
    success: false,
    code: 'TOO_MANY_ATTEMPTS',
    message: 'Too many sign-in attempts. Please try again in 15 minutes.',
  },
});

/** Uploads are expensive in bandwidth and disk. */
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => disabled,
  message: { success: false, message: 'Too many uploads, please try again later' },
});

/** Caps password-reset requests and token guesses per email/IP. */
export const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => disabled,
  keyGenerator: (req: Request) => {
    const email = (req.body as { email?: unknown } | undefined)?.email;
    return typeof email === 'string' && email ? `reset:${email.trim().toLowerCase()}` : `reset-ip:${req.ip}`;
  },
  message: {
    success: false,
    code: 'TOO_MANY_ATTEMPTS',
    message: 'Too many password reset requests. Please try again in 15 minutes.',
  },
});
