/**
 * components/ui/Card.tsx
 * -----------------------------------------------------------------------------
 * Surface primitive for every dashboard panel.
 * -----------------------------------------------------------------------------
 */
import type { ReactNode } from 'react';

export interface CardProps {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  style?: React.CSSProperties;
}

export function Card({ title, subtitle, actions, children, style }: CardProps) {
  return (
    <section
      style={{
        background: '#0b0b12',
        border: '1px solid #1e1e2a',
        borderRadius: '14px',
        padding: '18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        minWidth: 0,
        ...style,
      }}
    >
      {title !== undefined ? (
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 700, letterSpacing: '0.02em' }}>
              {title}
            </h2>
            {subtitle !== undefined ? (
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#8b8ba0' }}>{subtitle}</p>
            ) : null}
          </div>
          {actions}
        </header>
      ) : null}
      {children}
    </section>
  );
}
