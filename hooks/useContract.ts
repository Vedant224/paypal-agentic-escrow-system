/**
 * hooks/useContract.ts
 * -----------------------------------------------------------------------------
 * Fetch and refresh the full state of a contract. Components never call
 * `fetch()` themselves — they read the returned state and call `refresh()`.
 * -----------------------------------------------------------------------------
 */
'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiGet, ApiClientError } from '@/lib/api-client';
import type { ContractState } from '@/types';

interface UseContractState {
  isLoading: boolean;
  error: string | null;
  contract: ContractState | null;
}

const INITIAL: UseContractState = {
  isLoading: true,
  error: null,
  contract: null,
};

function toMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.body.error;
  }

  return error instanceof Error ? error.message : 'Failed to load contract';
}

export function useContract(contractId: string) {
  const [state, setState] = useState<UseContractState>(INITIAL);

  const load = useCallback(async () => {
    setState((previous) => ({ ...previous, isLoading: true, error: null }));

    try {
      const contract = await apiGet<ContractState>(
        `/api/contract/${encodeURIComponent(contractId)}`,
      );

      setState({ isLoading: false, error: null, contract });
    } catch (error) {
      setState((previous) => ({
        isLoading: false,
        error: toMessage(error),
        contract: previous.contract,
      }));
    }
  }, [contractId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, refresh: load };
}
