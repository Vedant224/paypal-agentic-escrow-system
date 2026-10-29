/**
 * app/demo/v1-broken/page.tsx
 * -----------------------------------------------------------------------------
 * Intentionally failing demo page: 4 of 5 assertions pass (80% weight = $80.00 of $100.00). The `.primary-button` background colour is blue instead of the contracted green.
 *
 * The rendered markup matches the five demo assertions exactly:
 *   #main-heading, .welcome-text, .primary-button, plus a responsive container.
 * -----------------------------------------------------------------------------
 */
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Demo v1 - Broken (4/5 assertions)',
};

const ASSERTIONS = [
  { label: '#main-heading', detail: 'dom_exists - heading must be present', outcome: 'PASS' },
  { label: '.welcome-text', detail: 'text_contains - "task management"', outcome: 'PASS' },
  { label: '375px viewport', detail: 'no_horizontal_overflow', outcome: 'PASS' },
  { label: '.primary-button', detail: 'computed_style - background-color', outcome: 'FAIL' },
  { label: 'http_status_ok', detail: 'URL must return 2xx', outcome: 'PASS' },
];

export default function DemoV1BrokenPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: '#050508',
        color: '#e8e8f0',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ width: '100%', maxWidth: 560 }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            marginBottom: '20px',
          }}
        >
          <span
            style={{
              padding: '4px 12px',
              borderRadius: '999px',
              background: 'rgba(239,68,68,0.14)',
              color: '#f87171',
              fontSize: '13px',
              fontWeight: 600,
              letterSpacing: '0.02em',
            }}
          >
            v1 - BROKEN | 4/5 assertions pass
          </span>
          <span
            style={{
              padding: '4px 12px',
              borderRadius: '999px',
              background: '#15151f',
              border: '1px solid #26263a',
              color: '#8b8ba0',
              fontSize: '13px',
            }}
          >
            $80.00 of $100.00 captured
          </span>
        </div>

        <h1
          id="main-heading"
          style={{
            margin: '0 0 12px',
            fontSize: 'clamp(28px, 6vw, 40px)',
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
          }}
        >
          Task Management, delivered on schedule
        </h1>

        <p
          className="welcome-text"
          style={{
            margin: '0 0 24px',
            fontSize: '16px',
            lineHeight: 1.6,
            color: '#a9a9bd',
            overflowWrap: 'anywhere',
          }}
        >
          A focused task management workspace that keeps every milestone, payment
          and acceptance criterion in one verifiable place.
        </p>

        <button
          className="primary-button"
          type="button"
          style={{
            backgroundColor: 'rgb(0, 0, 255)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '10px',
            padding: '12px 22px',
            fontSize: '15px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Start managing tasks
        </button>

        <section
          aria-label="Configured assertion outcomes"
          style={{
            marginTop: '32px',
            paddingTop: '20px',
            borderTop: '1px solid #1e1e2a',
          }}
        >
          <h2 style={{ margin: '0 0 12px', fontSize: '14px', color: '#8b8ba0', fontWeight: 600 }}>
            CONFIGURED ASSERTION OUTCOMES
          </h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '8px' }}>
            {ASSERTIONS.map((assertion) => (
              <li
                key={assertion.label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: '#0b0b12',
                  border: '1px solid #1e1e2a',
                  fontSize: '13px',
                }}
              >
                <span style={{ color: '#a9a9bd' }}>
                  <strong style={{ color: '#e8e8f0' }}>{assertion.label}</strong>
                  <br />
                  {assertion.detail}
                </span>
                <span
                  style={{
                    alignSelf: 'center',
                    padding: '3px 10px',
                    borderRadius: '999px',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: assertion.outcome === 'PASS' ? '#4ade80' : '#f87171',
                    background:
                      assertion.outcome === 'PASS' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                  }}
                >
                  {assertion.outcome}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
