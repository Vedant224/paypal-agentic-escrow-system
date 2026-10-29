/**
 * components/CaptureLedger.tsx
 * -----------------------------------------------------------------------------
 * Chronological list of every partial capture: capture id, formatted USD
 * amount, timestamp and the verification run that produced it.
 * -----------------------------------------------------------------------------
 */
'use client';
import { StatusBadge } from './ui/StatusBadge';
import { formatTimestamp, formatUSD } from '@/lib/format';
import type { CaptureLedgerView } from '@/types';

export interface CaptureLedgerProps {
  entries: CaptureLedgerView[];
}

export function CaptureLedger({ entries }: CaptureLedgerProps) {
  if (entries.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: '13px', color: '#6d6d85' }}>
        No captures yet. Run a verification to settle the first milestone.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {entries.map((entry) => (
        <div
          key={entry.id}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            alignItems: 'center',
            gap: '10px',
            padding: '11px 13px',
            borderRadius: '9px',
            background: '#08080f',
            border: '1px solid #1e1e2a',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <strong style={{ fontSize: '14px', fontVariantNumeric: 'tabular-nums' }}>
                {formatUSD(entry.amountCents)}
              </strong>
              {entry.finalCapture ? (
                <StatusBadge status="COMPLETED" label="FINAL" />
              ) : null}
            </div>
            <div
              style={{
                marginTop: '4px',
                fontSize: '11px',
                color: '#6d6d85',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                overflowWrap: 'anywhere',
              }}
            >
              {entry.captureId}
            </div>
            <div style={{ marginTop: '3px', fontSize: '11px', color: '#6d6d85' }}>
              {formatTimestamp(entry.capturedAt)} · run {entry.verificationRunId.slice(0, 8)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
