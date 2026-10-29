/**
 * hooks/useVerification.ts
 * -----------------------------------------------------------------------------
 * Trigger a verification run and track its results, loading state and error.
 * -----------------------------------------------------------------------------
 */
'use client';
import { useCallback, useState } from 'react';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import type { VerificationResult } from '@/types';

interface VerificationState {
  isLoading: boolean;
  error: string | null;
  results: VerificationResult[] | null;
  deltaCaptureCents: number | null;
  status: string | null;
}

const INITIAL: VerificationState = {
  isLoading: false,
  error: null,
  results: null,
  deltaCaptureCents: null,
  status: null,
};

interface VerifyResponse {
  verificationRunId: string;
  results: VerificationResult[];
  deltaCaptureCents: number;
  captureId: string | null;
  status: string;
}

export function useVerification(contractId: string) {
  const [state, setState] = useState<VerificationState>(INITIAL);

  const verify = useCallback(
    async (deploymentUrl: string) => {
      setState({ ...INITIAL, isLoading: true });

      try {
        const data = await apiFetch<VerifyResponse>('/api/verify-and-capture', {
          contractId,
          deploymentUrl,
        });

        setState({
          isLoading: false,
          error: null,
          results: data.results,
          deltaCaptureCents: data.deltaCaptureCents,
          status: data.status,
        });
      } catch (error) {
        const message =
          error instanceof ApiClientError ? error.body.error : toMessage(error);

        setState({
          isLoading: false,
          error: message,
          results: null,
          deltaCaptureCents: null,
          status: null,
        });
      }
    },
    [contractId],
  );

  return { ...state, verify };
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Verification failed';
}
