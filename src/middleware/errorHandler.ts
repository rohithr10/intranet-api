import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { MulterError } from 'multer';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/environment.js';
import { logger } from '../utils/logger.js';

/** 404 for anything the routers did not match. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

/**
 * Single exit point for every failure. Translates driver/ODM/multer errors into
 * the app's `{ success:false, message, code, field }` shape and keeps internal
 * details (stacks, driver messages) out of production responses.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let statusCode = 500;
  let message = 'Internal server error';
  let code: string | undefined;
  let field: string | undefined;
  let details: unknown;

  if (err instanceof ApiError) {
    ({ statusCode, message, code, field, details } = {
      statusCode: err.statusCode,
      message: err.message,
      code: err.code,
      field: err.field,
      details: err.details,
    });
  } else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 422;
    code = 'VALIDATION_ERROR';
    const first = Object.values(err.errors)[0];
    message = first?.message ?? 'Validation failed';
    field = first?.path;
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    code = 'CAST_ERROR';
    field = err.path;
    message = `Invalid value for "${err.path}"`;
  } else if (isDuplicateKeyError(err)) {
    statusCode = 409;
    code = 'DUPLICATE_KEY';
    field = Object.keys(err.keyValue ?? {})[0];
    message = field ? `That ${field} is already in use` : 'Duplicate value';
  } else if (err instanceof MulterError) {
    statusCode = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    code = err.code;
    message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `File is larger than the ${Math.round(env.storage.maxUploadBytes / (1024 * 1024))}MB limit`
        : err.message;
  } else if (err instanceof SyntaxError && 'body' in err) {
    statusCode = 400;
    code = 'MALFORMED_JSON';
    message = 'Request body is not valid JSON';
  } else if (err instanceof Error) {
    // Unexpected: keep the detail in the log, not in the response.
    message = env.isProduction ? 'Internal server error' : err.message;
  }

  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} failed`, err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(code ? { code } : {}),
    ...(field ? { field } : {}),
    ...(details ? { details } : {}),
    ...(env.exposeErrorStack && err instanceof Error ? { stack: err.stack } : {}),
  });
}

function isDuplicateKeyError(err: unknown): err is { keyValue?: Record<string, unknown> } {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}
