type ApiErrorOptions = { code?: string; field?: string; details?: unknown };

/** Error carrying the HTTP status and machine-readable code the client needs. */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code?: string;
  readonly field?: string;
  readonly details?: unknown;

  constructor(statusCode: number, message: string, options: ApiErrorOptions = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = options.code;
    this.field = options.field;
    this.details = options.details;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message = 'Bad request', o: ApiErrorOptions = {}) {
    return new ApiError(400, message, { code: 'BAD_REQUEST', ...o });
  }
  static unauthorized(message = 'Authentication required', o: ApiErrorOptions = {}) {
    return new ApiError(401, message, { code: 'UNAUTHENTICATED', ...o });
  }
  static forbidden(message = 'You do not have permission to perform this action', o: ApiErrorOptions = {}) {
    return new ApiError(403, message, { code: 'FORBIDDEN', ...o });
  }
  static notFound(message = 'Resource not found', o: ApiErrorOptions = {}) {
    return new ApiError(404, message, { code: 'NOT_FOUND', ...o });
  }
  static conflict(message = 'Conflict', o: ApiErrorOptions = {}) {
    return new ApiError(409, message, { code: 'CONFLICT', ...o });
  }
  static payloadTooLarge(message = 'File too large', o: ApiErrorOptions = {}) {
    return new ApiError(413, message, { code: 'PAYLOAD_TOO_LARGE', ...o });
  }
  static unprocessable(message = 'Validation failed', o: ApiErrorOptions = {}) {
    return new ApiError(422, message, { code: 'VALIDATION_ERROR', ...o });
  }
  static internal(message = 'Internal server error', o: ApiErrorOptions = {}) {
    return new ApiError(500, message, { code: 'INTERNAL_ERROR', ...o });
  }
}
