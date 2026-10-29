/**
 * hooks/usePayPal.ts
 * -----------------------------------------------------------------------------
 * Drive the PayPal order lifecycle: create an order, authorize it after the
 * buyer approves it in the popup, and void the remaining funds.
 * -----------------------------------------------------------------------------
 */
'use client';
import { useCallback, useState } from 'react';
import { apiFetch, ApiClientError } from '@/lib/api-client';

interface CreateOrderResponse {
  contractId: string;
  orderId: string;
  totalBudgetCents: number;
  currency: string;
}

interface AuthorizeResponse {
  contractId: string;
  orderId: string;
  authorizationId: string;
  authorizationExpiresAt: string | null;
  status: string;
}

interface VoidResponse {
  contractId: string;
  status: string;
  voidedAuthorizationId: string;
}

interface PayPalState {
  isCreatingOrder: boolean;
  isAuthorizing: boolean;
  isVoiding: boolean;
  error: string | null;
  orderId: string | null;
  authorizationId: string | null;
}

const INITIAL: PayPalState = {
  isCreatingOrder: false,
  isAuthorizing: false,
  isVoiding: false,
  error: null,
  orderId: null,
  authorizationId: null,
};

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'PayPal operation failed';
}

export function usePayPal(contractId: string) {
  const [state, setState] = useState<PayPalState>(INITIAL);

  const createOrder = useCallback(async () => {
    setState((previous) => ({ ...previous, isCreatingOrder: true, error: null }));

    try {
      const data = await apiFetch<CreateOrderResponse>('/api/paypal/create-order', {
        contractId,
      });

      setState((previous) => ({
        ...previous,
        isCreatingOrder: false,
        orderId: data.orderId,
      }));

      return data.orderId;
    } catch (error) {
      const message =
        error instanceof ApiClientError ? error.body.error : toMessage(error);

      setState((previous) => ({ ...previous, isCreatingOrder: false, error: message }));
      return null;
    }
  }, [contractId]);

  const authorize = useCallback(async (orderId: string) => {
    setState((previous) => ({ ...previous, isAuthorizing: true, error: null }));

    try {
      const data = await apiFetch<AuthorizeResponse>('/api/paypal/authorize', {
        contractId,
        orderId,
      });

      setState((previous) => ({
        ...previous,
        isAuthorizing: false,
        authorizationId: data.authorizationId,
      }));

      return data;
    } catch (error) {
      const message =
        error instanceof ApiClientError ? error.body.error : toMessage(error);

      setState((previous) => ({ ...previous, isAuthorizing: false, error: message }));
      return null;
    }
  }, [contractId]);

  const voidAuthorization = useCallback(async () => {
    setState((previous) => ({ ...previous, isVoiding: true, error: null }));

    try {
      const data = await apiFetch<VoidResponse>('/api/paypal/void', { contractId });

      setState((previous) => ({ ...previous, isVoiding: false }));

      return data;
    } catch (error) {
      const message =
        error instanceof ApiClientError ? error.body.error : toMessage(error);

      setState((previous) => ({ ...previous, isVoiding: false, error: message }));
      return null;
    }
  }, [contractId]);

  return {
    ...state,
    createOrder,
    authorize,
    voidAuthorization,
  };
}
