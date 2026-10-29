/**
 * lib/api-response.ts
 * -----------------------------------------------------------------------------
 * Shared helpers for API routes: uniform error envelopes, body parsing and
 * trace-id propagation. Route files stay thin — they parse, delegate and
 * respond, and never contain business logic.
 * -----------------------------------------------------------------------------
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { ErrorCode } from './errors';
import { createTraceId, log } from './trace';

export interface ApiErrorBody {
  error: string;
  source: string;
  code: ErrorCode;
  details?: unknown;
  traceId: string;
}

/**
 * Build a JSON error response conforming to the `ApiErrorResponse` contract.
 */
export function apiError(
  source: string,
  error: string,
  code: ErrorCode,
  status: number,
  traceId: string,
  details?: unknown,
): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = {
    error,
    source,
    code,
    traceId,
    ...(details === undefined ? {} : { details }),
  };

  return NextResponse.json(body, { status });
}

/**
 * Parse and validate a request body.
 *
 * Returns either a validated payload or a ready-to-return 400 response.
 */
export async function parseBody<TSchema extends z.ZodTypeAny>(
  req: Request,
  schema: TSchema,
  source: string,
  traceId: string,
): Promise<{ ok: true; data: z.output<TSchema> } | { ok: false; response: NextResponse<ApiErrorBody> }> {
  let raw: unknown;

  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: apiError(
        source,
        'Failed to parse request JSON',
        'INVALID_REQUEST_BODY',
        400,
        traceId,
      ),
    };
  }

  const parsed = schema.safeParse(raw);

  if (!parsed.success) {
    return {
      ok: false,
      response: apiError(
        source,
        'Invalid request body',
        'INVALID_REQUEST_BODY',
        400,
        traceId,
        parsed.error.flatten(),
      ),
    };
  }

  return { ok: true, data: parsed.data };
}

/**
 * Wrap a route handler so unexpected errors always produce a structured 500
 * with a trace id, instead of Next.js' default HTML error page.
 */
export function withErrorHandling(
  source: string,
  handler: (traceId: string) => Promise<NextResponse>,
): Promise<NextResponse> {
  const traceId = createTraceId();

  return handler(traceId).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);

    log('ERROR', traceId, source, 'Unhandled route error', { message });

    return apiError(
      source,
      'Internal server error',
      'INTERNAL_ERROR',
      500,
      traceId,
      { message },
    );
  });
}
