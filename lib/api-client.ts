/**
 * lib/api-client.ts
 * -----------------------------------------------------------------------------
 * The one fetch wrapper used by every hook and component. It always attaches
 * `Content-Type: application/json`, parses error envelopes into a typed
 * `ApiClientError`, and never leaks raw response bodies to callers.
 * -----------------------------------------------------------------------------
 */
import type { ApiErrorResponse } from '@/types';

const FILE_NAME = 'api-client.ts';

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorResponse,
  ) {
    super(`[api-client.ts::apiFetch] ${body.source}: ${body.error}`);
    this.name = 'ApiClientError';
  }
}

export async function apiFetch<T>(url: string, body: unknown): Promise<T> {
  const fnName = `${FILE_NAME}::apiFetch`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data: unknown = await res.json();

  if (!res.ok) {
    throw new ApiClientError(res.status, data as ApiErrorResponse);
  }

  if (data === null || typeof data !== 'object') {
    throw new Error(`[${fnName}] Response was not a JSON object`);
  }

  return data as T;
}

/**
 * Variant that performs a GET and parses the JSON response. Used by the
 * contract hook when polling contract state.
 */
export async function apiGet<T>(url: string): Promise<T> {
  const fnName = `${FILE_NAME}::apiGet`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  const data: unknown = await res.json();

  if (!res.ok) {
    throw new ApiClientError(res.status, data as ApiErrorResponse);
  }

  if (data === null || typeof data !== 'object') {
    throw new Error(`[${fnName}] Response was not a JSON object`);
  }

  return data as T;
}
