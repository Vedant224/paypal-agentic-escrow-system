/**
 * lib/trace.ts
 * -----------------------------------------------------------------------------
 * Structured JSON logging with a per-request trace id. Sensitive keys are
 * redacted recursively before anything reaches stdout, so API keys, secrets and
 * bearer tokens can never leak into logs or CI output.
 * -----------------------------------------------------------------------------
 */
import { randomUUID } from 'node:crypto';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

const SENSITIVE_KEYS = new Set([
  'secret',
  'password',
  'apiKey',
  'api_key',
  'authorization',
  'token',
  'accessToken',
  'refreshToken',
  'clientSecret',
  'client_secret',
  'paypalClientSecret',
  'oAuthClientSecret',
  'cookie',
  'setCookie',
]);

const REDACTED = '[REDACTED]';

export function createTraceId(): string {
  return randomUUID();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Recursively redact sensitive values. Keys are normalised (lower-cased, with
 * `-`/`_` stripped) before comparison so `client_secret`, `clientSecret` and
 * `Client-Secret` are all caught.
 */
export function redact(data: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const normalisedKey = key.toLowerCase().replace(/[-_]/g, '');

    if (SENSITIVE_KEYS.has(normalisedKey)) {
      cleaned[key] = REDACTED;
    } else if (Array.isArray(value)) {
      cleaned[key] = value.map((entry) =>
        isPlainObject(entry) ? redact(entry) : entry,
      );
    } else if (isPlainObject(value)) {
      cleaned[key] = redact(value);
    } else {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

export function log(
  level: LogLevel,
  traceId: string,
  source: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    traceId,
    source,
    message,
  };

  if (data !== undefined) {
    entry.data = redact(data);
  }

  const serialised = JSON.stringify(entry);

  if (level === 'ERROR') {
    console.error(serialised);
  } else if (level === 'WARN') {
    console.warn(serialised);
  } else {
    console.log(serialised);
  }
}
