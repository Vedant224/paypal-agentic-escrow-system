/**
 * components/FreelancerPanel.tsx
 * -----------------------------------------------------------------------------
 * Freelancer-side controls: enter the deployment URL, run deterministic
 * verification, and use the one-click demo presets.
 * -----------------------------------------------------------------------------
 */
'use client';
import { useState } from 'react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Input } from './ui/Input';
import { Spinner } from './ui/Spinner';
import { StatusBadge } from './ui/StatusBadge';
import { formatUSD } from '@/lib/format';
import type { ContractState } from '@/types';

export interface FreelancerPanelProps {
  contract: ContractState | null;
  isVerifying: boolean;
  verificationError: string | null;
  deltaCaptureCents: number | null;
  onVerify: (deploymentUrl: string) => Promise<void>;
  appUrl: string;
  sandboxBuyerEmail: string;
  sandboxBuyerPassword: string;
}

const DEMO_PRESETS = [
  {
    id: 'v1-broken',
    label: 'Test v1-broken (4/5 -> $80)',
    path: '/demo/v1-broken',
    description: 'Four assertions pass; the computed_style check fails.',
  },
  {
    id: 'v2-fixed',
    label: 'Test v2-fixed (5/5 -> +$20)',
    path: '/demo/v2-fixed',
    description: 'All five assertions pass; triggers the final capture.',
  },
] as const;

export function FreelancerPanel({
  contract,
  isVerifying,
  verificationError,
  deltaCaptureCents,
  onVerify,
  appUrl,
  sandboxBuyerEmail,
  sandboxBuyerPassword,
}: FreelancerPanelProps) {
  const [deploymentUrl, setDeploymentUrl] = useState(`${appUrl}/demo/v1-broken`);
  const [copied, setCopied] = useState<string | null>(null);

  const passedCount = contract?.criteria.filter((criterion) => criterion.status === 'PASSED').length ?? 0;

  async function copyToClipboard(label: string, value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  }

  return (
    <Card
      title="Freelancer"
      subtitle="Submit a deployment and earn payment for passing criteria"
      actions={
        contract !== null ? (
          <StatusBadge status={passedCount === 5 ? 'PASSED' : 'PENDING'} label={`${passedCount}/5`} />
        ) : null
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Input
          label="Deployment URL"
          value={deploymentUrl}
          onChange={(event) => setDeploymentUrl(event.target.value)}
          placeholder="https://your-deployment.example.com"
          hint="Public HTTPS URLs and the official /demo/* routes only"
        />

        <Button
          isLoading={isVerifying}
          disabled={deploymentUrl.trim().length === 0}
          onClick={() => void onVerify(deploymentUrl)}
        >
          Run deterministic verification
        </Button>

        {isVerifying ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#8b8ba0' }}>
            <Spinner size="sm" label="Verifying" /> Running assertions in a headless browser...
          </div>
        ) : null}

        {verificationError !== null ? (
          <p style={{ margin: 0, fontSize: '12px', color: '#f87171' }}>{verificationError}</p>
        ) : null}

        {deltaCaptureCents !== null && deltaCaptureCents > 0 ? (
          <p style={{ margin: 0, fontSize: '12px', color: '#4ade80' }}>
            Captured {formatUSD(deltaCaptureCents)} for newly verified criteria.
          </p>
        ) : null}

        <div style={{ paddingTop: '4px', borderTop: '1px solid #1e1e2a' }}>
          <div style={{ fontSize: '11px', color: '#8b8ba0', fontWeight: 600, marginBottom: '8px' }}>
            ONE-CLICK DEMO PRESETS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {DEMO_PRESETS.map((preset) => (
              <div
                key={preset.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: '#08080f',
                  border: '1px solid #1e1e2a',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{preset.label}</div>
                  <div style={{ fontSize: '11px', color: '#6d6d85' }}>{preset.description}</div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const url = `${appUrl}${preset.path}`;
                    setDeploymentUrl(url);
                    void onVerify(url);
                  }}
                >
                  Run
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div style={{ paddingTop: '4px', borderTop: '1px solid #1e1e2a' }}>
          <div style={{ fontSize: '11px', color: '#8b8ba0', fontWeight: 600, marginBottom: '8px' }}>
            PAYPAL SANDBOX BUYER
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <button
              type="button"
              onClick={() => void copyToClipboard('email', sandboxBuyerEmail)}
              style={{
                padding: '5px 11px',
                fontSize: '12px',
                fontFamily: 'inherit',
                color: '#a9a9bd',
                background: '#12121c',
                border: '1px solid #26263a',
                borderRadius: '999px',
                cursor: 'pointer',
              }}
            >
              {copied === 'email' ? 'Copied email' : `Email: ${sandboxBuyerEmail}`}
            </button>
            <button
              type="button"
              onClick={() => void copyToClipboard('password', sandboxBuyerPassword)}
              style={{
                padding: '5px 11px',
                fontSize: '12px',
                fontFamily: 'inherit',
                color: '#a9a9bd',
                background: '#12121c',
                border: '1px solid #26263a',
                borderRadius: '999px',
                cursor: 'pointer',
              }}
            >
              {copied === 'password' ? 'Copied password' : 'Copy password'}
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
