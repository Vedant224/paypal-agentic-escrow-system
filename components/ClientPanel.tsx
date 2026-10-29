/**
 * components/ClientPanel.tsx
 * -----------------------------------------------------------------------------
 * Client-side controls: project scope, contract compilation, the PayPal
 * authorize button and the void-remaining-funds action.
 * -----------------------------------------------------------------------------
 */
'use client';
import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js';
import { useState } from 'react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Input } from './ui/Input';
import { Spinner } from './ui/Spinner';
import { StatusBadge } from './ui/StatusBadge';
import { formatUSD } from '@/lib/format';
import type { ContractState } from '@/types';

export interface ClientPanelProps {
  contract: ContractState | null;
  paypalClientId: string;
  isCreatingOrder: boolean;
  isAuthorizing: boolean;
  isVoiding: boolean;
  paypalError: string | null;
  onCreateOrder: () => Promise<string | null>;
  onAuthorize: (orderId: string) => Promise<unknown>;
  onVoid: () => Promise<unknown>;
  onCompile: (projectRequirements: string, totalBudgetCents: number) => Promise<void>;
  isCompiling: boolean;
  compileError: string | null;
}

const payPalOptions = {
  clientId: '',
  currency: 'USD',
  intent: 'authorize' as const,
};

export function ClientPanel({
  contract,
  paypalClientId,
  isCreatingOrder,
  isAuthorizing,
  isVoiding,
  paypalError,
  onCreateOrder,
  onAuthorize,
  onVoid,
  onCompile,
  isCompiling,
  compileError,
}: ClientPanelProps) {
  const [scope, setScope] = useState(
    'Build a responsive task management landing page with a green primary call-to-action button.',
  );
  const [budget, setBudget] = useState('100.00');

  const budgetCents = Math.round(Number.parseFloat(budget || '0') * 100);
  const isAuthorized = contract?.contract.status === 'AUTHORIZED';
  const isPartiallyCaptured = contract?.contract.status === 'PARTIALLY_CAPTURED';
  const canVoid =
    (isAuthorized || isPartiallyCaptured) && contract?.contract.paypalAuthorizationId != null;

  return (
    <Card
      title="Client"
      subtitle="Define scope, authorize funds, release or void escrow"
      actions={
        contract !== null ? (
          <StatusBadge
            status={
              contract.contract.status === 'COMPLETED'
                ? 'COMPLETED'
                : contract.contract.status === 'AUTHORIZED'
                  ? 'PASSED'
                  : contract.contract.status === 'PARTIALLY_CAPTURED'
                    ? 'PASSED'
                    : contract.contract.status === 'VOIDED'
                      ? 'FAILED'
                      : 'PENDING'
            }
            label={contract.contract.status.replace('_', ' ')}
          />
        ) : null
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Input
          label="Project scope"
          value={scope}
          onChange={(event) => setScope(event.target.value)}
          placeholder="Describe the deliverable in plain language"
        />

        <Input
          label="Total budget (USD)"
          value={budget}
          onChange={(event) => setBudget(event.target.value)}
          inputMode="decimal"
          hint={`${Number.isFinite(budgetCents) ? formatUSD(budgetCents) : '$0.00'} held in escrow`}
        />

        <Button
          variant="secondary"
          isLoading={isCompiling}
          onClick={() => {
            void onCompile(scope, budgetCents);
          }}
        >
          Compile contract with AI agents
        </Button>

        {compileError !== null ? (
          <p style={{ margin: 0, fontSize: '12px', color: '#f87171' }}>{compileError}</p>
        ) : null}

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            alignItems: 'center',
            paddingTop: '4px',
            borderTop: '1px solid #1e1e2a',
          }}
        >
          <Button
            isLoading={isCreatingOrder}
            disabled={contract === null}
            onClick={() => {
              void onCreateOrder().then((orderId) => {
                if (orderId !== null) {
                  void onAuthorize(orderId);
                }
              });
            }}
          >
            Authorize {contract !== null ? formatUSD(contract.contract.totalBudgetCents) : '$0.00'}
          </Button>

          {canVoid ? (
            <Button variant="destructive" isLoading={isVoiding} onClick={() => void onVoid()}>
              Void remaining funds
            </Button>
          ) : null}
        </div>

        {contract?.contract.paypalAuthorizationId != null ? (
          <div
            style={{
              fontSize: '11px',
              color: '#6d6d85',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              overflowWrap: 'anywhere',
            }}
          >
            Authorization: {contract.contract.paypalAuthorizationId}
          </div>
        ) : null}

        {paypalClientId.length > 0 ? (
          <div style={{ paddingTop: '4px' }}>
            <div style={{ fontSize: '11px', color: '#6d6d85', marginBottom: '6px' }}>
              PayPal Sandbox approval
            </div>
            <PayPalScriptProvider
              options={{ ...payPalOptions, clientId: paypalClientId }}
              deferLoading={false}
            >
              <PayPalButtons
                style={{ layout: 'vertical', shape: 'rect', label: 'paypal' }}
                createOrder={async () => {
                  const orderId = await onCreateOrder();
                  return orderId ?? '';
                }}
                onApprove={async (data) => {
                  await onAuthorize(data.orderID);
                }}
              />
            </PayPalScriptProvider>
          </div>
        ) : null}

        {paypalError !== null ? (
          <p style={{ margin: 0, fontSize: '12px', color: '#f87171' }}>{paypalError}</p>
        ) : null}

        {isAuthorizing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#8b8ba0' }}>
            <Spinner size="sm" label="Authorizing" /> Authorizing payment...
          </div>
        ) : null}
      </div>
    </Card>
  );
}
