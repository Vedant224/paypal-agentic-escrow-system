/**
 * lib/retry.ts
 * -----------------------------------------------------------------------------
 * Reusable exponential-backoff retry helper used by every flaky external
 * integration (PayPal API, AI generation, database writes).
 * -----------------------------------------------------------------------------
 */

export interface RetryOptions {
  maxRetries?: number;
  label: string;
  backoffMs?: number;
  /** Optional predicate deciding whether a failure is worth retrying. */
  isRetryable?: (error: unknown) => boolean;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BACKOFF_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    label,
    backoffMs = DEFAULT_BACKOFF_MS,
    isRetryable,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[retry::${label}] Attempt ${attempt}/${maxRetries} failed: ${message}`,
      );

      if (attempt === maxRetries) {
        break;
      }

      if (isRetryable !== undefined && !isRetryable(error)) {
        break;
      }

      await sleep(backoffMs * Math.pow(2, attempt - 1));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`[retry::${label}] Exhausted all ${maxRetries} retries`);
}
