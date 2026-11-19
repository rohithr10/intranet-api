import type { NextFunction, Request, Response } from 'express';

/**
 * Strips `$`-prefixed and dotted keys from request payloads so a body like
 * `{ "email": { "$ne": null } }` cannot turn a findOne into an operator query.
 *
 * Written inline rather than pulled in as a dependency: express-mongo-sanitize
 * mutates `req.query` in place, which Express 5 makes read-only, and the whole
 * behaviour is a dozen lines. Mongoose `sanitizeFilter` is the second layer.
 */
function scrub(value: unknown, depth = 0): unknown {
  if (depth > 12 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => scrub(item, depth + 1));

  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (key.startsWith('$') || key.includes('.')) continue;
    output[key] = scrub(nested, depth + 1);
  }
  return output;
}

export function sanitizeMongo(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === 'object') req.body = scrub(req.body);
  if (req.params && typeof req.params === 'object') {
    Object.defineProperty(req, 'params', { value: scrub(req.params), writable: true, configurable: true });
  }
  if (req.query && typeof req.query === 'object') {
    Object.defineProperty(req, 'query', { value: scrub(req.query), writable: true, configurable: true });
  }
  return next();
}
