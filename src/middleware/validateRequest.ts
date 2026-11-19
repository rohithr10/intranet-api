import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { ApiError } from '../utils/ApiError.js';

type Source = 'body' | 'query' | 'params';

/**
 * Validates one part of the request and replaces it with the parsed value, so
 * handlers receive typed, coerced, whitelisted data — unknown keys are dropped
 * by the schemas rather than reaching a Mongoose update.
 */
export function validateRequest(schema: ZodTypeAny, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req[source]);
      Object.defineProperty(req, source, { value: parsed, writable: true, configurable: true });
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        const first = err.issues[0];
        return next(
          ApiError.unprocessable(first?.message ?? 'Validation failed', {
            field: first?.path.join('.'),
            details: err.issues.map((issue) => ({
              field: issue.path.join('.'),
              message: issue.message,
            })),
          }),
        );
      }
      return next(err);
    }
  };
}
