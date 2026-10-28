/**
 * lib/errors.ts
 * -----------------------------------------------------------------------------
 * Central registry of application error classes and the canonical API error
 * response shape. Every error class carries the originating file + function so
 * a failure can be traced back to a single line of code from the logs alone.
 * -----------------------------------------------------------------------------
 */

export type ErrorCode =
  | 'INVALID_REQUEST_BODY'
  | 'CONTRACT_NOT_FOUND'
  | 'CONTRACT_NOT_AUTHORIZED'
  | 'AUTHORIZATION_EXPIRED'
  | 'VERIFICATION_IN_PROGRESS'
  | 'WEIGHT_SUM_INVALID'
  | 'PAYPAL_ORDER_FAILED'
  | 'PAYPAL_AUTH_FAILED'
  | 'PAYPAL_CAPTURE_FAILED'
  | 'PAYPAL_VOID_FAILED'
  | 'BROWSER_CONNECTION_FAILED'
  | 'VERIFICATION_TIMEOUT'
  | 'UNSAFE_URL_OR_SELECTOR'
  | 'AI_GENERATION_FAILED'
  | 'DB_WRITE_FAILED'
  | 'PARSER_ERROR'
  | 'INTERNAL_ERROR';

export interface ApiErrorResponse {
  error: string;
  source: string;
  code: ErrorCode;
  details?: unknown;
  traceId?: string;
}

/**
 * Base class for every application error. The message is always prefixed with
 * `[fileName::functionName]` so log greps and error toasts stay unambiguous.
 */
export class AppError extends Error {
  constructor(
    public readonly fileName: string,
    public readonly functionName: string,
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number = 500,
    public readonly context?: Record<string, unknown>,
    public readonly cause?: unknown,
  ) {
    super(`[${fileName}::${functionName}] ${message}`);
    this.name = new.target.name;
    if (cause !== undefined) {
      Object.defineProperty(this, 'cause', { value: cause, enumerable: false, writable: true });
    }
  }

  get source(): string {
    return `${this.fileName}::${this.functionName}`;
  }
}

export class VerificationEngineError extends AppError {
  constructor(
    fn: string,
    message: string,
    code: ErrorCode = 'VERIFICATION_TIMEOUT',
    ctx?: Record<string, unknown>,
    cause?: unknown,
  ) {
    super('verification-engine.ts', fn, code, message, 500, ctx, cause);
  }
}

export class PayPalClientError extends AppError {
  constructor(
    fn: string,
    message: string,
    code: ErrorCode = 'PAYPAL_CAPTURE_FAILED',
    ctx?: Record<string, unknown>,
    cause?: unknown,
  ) {
    super('paypal-client.ts', fn, code, message, 502, ctx, cause);
  }
}

export class BrowserConnectorError extends AppError {
  constructor(
    fn: string,
    message: string,
    ctx?: Record<string, unknown>,
    cause?: unknown,
  ) {
    super('browser-connector.ts', fn, 'BROWSER_CONNECTION_FAILED', message, 503, ctx, cause);
  }
}

export class ParserError extends AppError {
  constructor(
    fn: string,
    message: string,
    ctx?: Record<string, unknown>,
    cause?: unknown,
  ) {
    super('parser.ts', fn, 'PARSER_ERROR', message, 400, ctx, cause);
  }
}

export class AgentToolError extends AppError {
  constructor(
    fn: string,
    message: string,
    code: ErrorCode = 'AI_GENERATION_FAILED',
    ctx?: Record<string, unknown>,
    cause?: unknown,
  ) {
    super('agent-tools.ts', fn, code, message, 500, ctx, cause);
  }
}

export class ApiRouteError extends AppError {
  constructor(
    fn: string,
    message: string,
    code: ErrorCode = 'INTERNAL_ERROR',
    statusCode: number = 500,
    ctx?: Record<string, unknown>,
    cause?: unknown,
  ) {
    super(fn.split('::')[0] ?? 'api/route.ts', fn.split('::')[1] ?? fn, code, message, statusCode, ctx, cause);
  }
}

export class DatabaseError extends AppError {
  constructor(
    fn: string,
    message: string,
    code: ErrorCode = 'DB_WRITE_FAILED',
    ctx?: Record<string, unknown>,
    cause?: unknown,
  ) {
    super('prisma.ts', fn, code, message, 500, ctx, cause);
  }
}

export class EnvValidationError extends AppError {
  constructor(fn: string, message: string, ctx?: Record<string, unknown>) {
    super('env.ts', fn, 'INTERNAL_ERROR', message, 500, ctx);
  }
}

/**
 * Narrow an unknown thrown value into a readable message without ever
 * assuming it is an `Error` instance.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
