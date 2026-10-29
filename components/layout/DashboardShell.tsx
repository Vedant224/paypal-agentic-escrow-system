/**
 * components/layout/DashboardShell.tsx
 * -----------------------------------------------------------------------------
 * Split-screen shell holding every dashboard panel on a single page, with the
 * role focus toggle in the header. Panels are dimmed — never hidden — when a
 * role focus is active.
 * -----------------------------------------------------------------------------
 */
'use client';
import type { ReactNode } from 'react';
import { RoleHighlightToggle } from './RoleHighlightToggle';
import type { RoleFocus } from '@/types';

export interface DashboardShellProps {
  /** Highlight state for the client half of the split screen. */
  clientFocus: RoleFocus;
  /** Highlight state for the freelancer half of the split screen. */
  freelancerFocus: RoleFocus;
  onRoleChange: (focus: RoleFocus) => void;
  summaryBar: ReactNode;
  topRow: ReactNode;
  middleRow: ReactNode;
  bottomRow: ReactNode;
}

export function DashboardShell({
  clientFocus,
  freelancerFocus,
  onRoleChange,
  summaryBar,
  topRow,
  middleRow,
  bottomRow,
}: DashboardShellProps) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#050508',
        color: '#e8e8f0',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px',
          padding: '14px 24px',
          background: 'rgba(5,5,8,0.88)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid #1e1e2a',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/paypal-logo.svg" alt="" width={22} height={22} />
          <strong style={{ fontSize: '14px', letterSpacing: '0.02em' }}>
            PayPal Agentic Escrow
          </strong>
        </div>

        <RoleHighlightToggle value={clientFocus === freelancerFocus ? clientFocus : 'all'} onChange={onRoleChange} />
      </header>

      <main
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          padding: '20px 24px 40px',
        }}
      >
        {summaryBar}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: '18px',
          }}
        >
          <div
            className="role-panel"
            data-role="client"
            data-dimmed={clientFocus === 'freelancer' ? 'true' : 'false'}
            data-highlighted={clientFocus === 'client' ? 'true' : 'false'}
          >
            {topRow}
          </div>
          <div
            className="role-panel"
            data-role="freelancer"
            data-dimmed={freelancerFocus === 'client' ? 'true' : 'false'}
            data-highlighted={freelancerFocus === 'freelancer' ? 'true' : 'false'}
          >
            {middleRow}
          </div>
        </div>

        {bottomRow}
      </main>
    </div>
  );
}
