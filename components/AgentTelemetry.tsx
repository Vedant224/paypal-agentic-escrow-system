/**
 * components/AgentTelemetry.tsx
 * -----------------------------------------------------------------------------
 * Redacted log of every Agent Toolkit and custom escrow tool invocation.
 * -----------------------------------------------------------------------------
 */
'use client';
import type { TelemetryEntry } from '@/types';

export interface AgentTelemetryProps {
  entries: TelemetryEntry[];
}

const LEVEL_COLORS: Record<TelemetryEntry['level'], string> = {
  INFO: '#38bdf8',
  WARN: '#fbbf24',
  ERROR: '#f87171',
};

export function AgentTelemetry({ entries }: AgentTelemetryProps) {
  if (entries.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: '13px', color: '#6d6d85' }}>
        No agent tool invocations recorded yet.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {entries.map((entry) => (
        <div
          key={entry.id}
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '10px',
            padding: '9px 11px',
            borderRadius: '8px',
            background: '#08080f',
            border: '1px solid #1e1e2a',
            fontSize: '12px',
          }}
        >
          <span
            style={{
              color: LEVEL_COLORS[entry.level],
              fontWeight: 700,
              fontSize: '10px',
              letterSpacing: '0.06em',
              paddingTop: '2px',
            }}
          >
            {entry.level}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: '#e8e8f0', fontWeight: 600 }}>{entry.tool}</div>
            <div style={{ color: '#8b8ba0', overflowWrap: 'anywhere' }}>{entry.summary}</div>
            <div style={{ color: '#5a5a70', fontSize: '11px', marginTop: '2px' }}>
              {new Date(entry.timestamp).toLocaleTimeString('en-US')}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
