/**
 * app/page.tsx
 * -----------------------------------------------------------------------------
 * The unified settlement dashboard. Every major section is wrapped in an
 * ErrorBoundary so a crash in AG Grid or the PayPal button can never take the
 * whole page down on stage.
 * -----------------------------------------------------------------------------
 */
'use client';
import { useCallback, useEffect, useState } from 'react';
import { AgentTelemetry } from '@/components/AgentTelemetry';
import { CaptureLedger } from '@/components/CaptureLedger';
import { ClientPanel } from '@/components/ClientPanel';
import { FreelancerPanel } from '@/components/FreelancerPanel';
import { SettlementMatrix } from '@/components/SettlementMatrix';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Spinner } from '@/components/ui/Spinner';
import { useContract } from '@/hooks/useContract';
import { usePayPal } from '@/hooks/usePayPal';
import { useVerification } from '@/hooks/useVerification';
import { apiFetch } from '@/lib/api-client';
import { formatPercentage, formatUSD } from '@/lib/format';
import type { RoleFocus, TelemetryEntry } from '@/types';

const DEFAULT_CONTRACT_ID = 'default';

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

const SANDBOX_BUYER_EMAIL =
  process.env.NEXT_PUBLIC_PAYPAL_SANDBOX_BUYER_EMAIL ?? 'buyer@example.com';

const SANDBOX_BUYER_PASSWORD =
  process.env.NEXT_PUBLIC_PAYPAL_SANDBOX_BUYER_PASSWORD ?? 'password';

const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? '';

export default function HomePage() {
  const [roleFocus, setRoleFocus] = useState<RoleFocus>('all');
  const [telemetry, setTelemetry] = useState<TelemetryEntry[]>([]);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);

  const contractId = DEFAULT_CONTRACT_ID;
  const { isLoading, error, contract, refresh } = useContract(contractId);
  const verification = useVerification(contractId);
  const paypal = usePayPal(contractId);

  useEffect(() => {
    setTelemetry([
      {
        id: 'boot',
        timestamp: new Date().toISOString(),
        source: 'system',
        tool: 'session',
        summary: `Dashboard loaded for contract ${contractId}`,
        level: 'INFO',
      },
    ]);
  }, [contractId]);

  const handleCompile = useCallback(
    async (projectRequirements: string, totalBudgetCents: number) => {
      setIsCompiling(true);
      setCompileError(null);

      try {
        await apiFetch<{ contractId: string }>('/api/contract/compile', {
          projectRequirements,
          totalBudgetCents,
          clientId: 'demo-client-1',
        });

        await refresh();
      } catch (compileFailure) {
        setCompileError(
          compileFailure instanceof Error ? compileFailure.message : 'Contract compilation failed',
        );
      } finally {
        setIsCompiling(false);
      }
    },
    [refresh],
  );

  const handleVerify = useCallback(
    async (deploymentUrl: string) => {
      await verification.verify(deploymentUrl);
      await refresh();

      setTelemetry((previous) => [
        {
          id: `verify-${Date.now()}`,
          timestamp: new Date().toISOString(),
          source: 'verification-engine',
          tool: 'verify_and_capture',
          summary: `Verified ${deploymentUrl}`,
          level: verification.error === null ? 'INFO' : 'ERROR',
        },
        ...previous,
      ]);
    },
    [verification, refresh],
  );

  const clientFocus: RoleFocus = roleFocus === 'freelancer' ? 'freelancer' : 'client';
  const freelancerFocus: RoleFocus = roleFocus === 'client' ? 'client' : 'freelancer';

  const totalBudgetCents = contract?.contract.totalBudgetCents ?? 0;
  const totalCapturedCents = contract?.totalCapturedCents ?? 0;
  const remainingCents = contract?.remainingAuthorizedCents ?? totalBudgetCents;
  const passPercentage = contract?.passPercentage ?? 0;

  const summaryBar = (
    <ErrorBoundary
      componentName="SummaryBar"
      fallback={<p style={{ color: '#f87171', fontSize: '13px' }}>Summary failed to load.</p>}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
        }}
      >
        {[
          { label: 'Total authorized', value: formatUSD(totalBudgetCents) },
          { label: 'Total captured', value: formatUSD(totalCapturedCents) },
          { label: 'Held in escrow', value: formatUSD(remainingCents) },
          { label: 'Pass percentage', value: formatPercentage(passPercentage) },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              padding: '14px 16px',
              borderRadius: '12px',
              background: '#0b0b12',
              border: '1px solid #1e1e2a',
            }}
          >
            <div style={{ fontSize: '11px', color: '#8b8ba0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {stat.label}
            </div>
            <div
              style={{
                marginTop: '6px',
                fontSize: '24px',
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {stat.value}
            </div>
          </div>
        ))}
      </div>
    </ErrorBoundary>
  );

  return (
    <DashboardShell
      clientFocus={clientFocus}
      freelancerFocus={freelancerFocus}
      onRoleChange={setRoleFocus}
      summaryBar={summaryBar}
      topRow={
        <ErrorBoundary
          componentName="ClientPanel"
          fallback={<p style={{ color: '#f87171', fontSize: '13px' }}>Client panel failed to load.</p>}
        >
          <ClientPanel
            contract={contract}
            paypalClientId={PAYPAL_CLIENT_ID}
            isCreatingOrder={paypal.isCreatingOrder}
            isAuthorizing={paypal.isAuthorizing}
            isVoiding={paypal.isVoiding}
            paypalError={paypal.error}
            onCreateOrder={paypal.createOrder}
            onAuthorize={paypal.authorize}
            onVoid={paypal.voidAuthorization}
            onCompile={handleCompile}
            isCompiling={isCompiling}
            compileError={compileError}
          />
        </ErrorBoundary>
      }
      middleRow={
        <ErrorBoundary
          componentName="FreelancerPanel"
          fallback={<p style={{ color: '#f87171', fontSize: '13px' }}>Freelancer panel failed to load.</p>}
        >
          <FreelancerPanel
            contract={contract}
            isVerifying={verification.isLoading}
            verificationError={verification.error}
            deltaCaptureCents={verification.deltaCaptureCents}
            onVerify={handleVerify}
            appUrl={APP_URL}
            sandboxBuyerEmail={SANDBOX_BUYER_EMAIL}
            sandboxBuyerPassword={SANDBOX_BUYER_PASSWORD}
          />
        </ErrorBoundary>
      }
      bottomRow={
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <ErrorBoundary
            componentName="SettlementMatrix"
            fallback={<p style={{ color: '#f87171', fontSize: '13px' }}>Settlement matrix failed to load.</p>}
          >
            <Card title="Settlement matrix" subtitle="All 5 weighted acceptance criteria">
              {isLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#8b8ba0', fontSize: '13px' }}>
                  <Spinner label="Loading contract" /> Loading contract...
                </div>
              ) : error !== null ? (
                <div>
                  <p style={{ margin: '0 0 10px', color: '#f87171', fontSize: '13px' }}>{error}</p>
                  <Button size="sm" variant="secondary" onClick={() => void refresh()}>
                    Retry
                  </Button>
                </div>
              ) : (
                <SettlementMatrix criteria={contract?.criteria ?? []} />
              )}
            </Card>
          </ErrorBoundary>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '18px',
            }}
          >
            <ErrorBoundary
              componentName="CaptureLedger"
              fallback={<p style={{ color: '#f87171', fontSize: '13px' }}>Capture ledger failed to load.</p>}
            >
              <Card title="Capture ledger" subtitle="Every proportional partial capture">
                <CaptureLedger entries={contract?.captureLedger ?? []} />
              </Card>
            </ErrorBoundary>

            <ErrorBoundary
              componentName="AgentTelemetry"
              fallback={<p style={{ color: '#f87171', fontSize: '13px' }}>Telemetry failed to load.</p>}
            >
              <Card title="Agent telemetry" subtitle="Redacted tool invocations">
                <AgentTelemetry entries={telemetry} />
              </Card>
            </ErrorBoundary>
          </div>
        </div>
      }
    />
  );
}
