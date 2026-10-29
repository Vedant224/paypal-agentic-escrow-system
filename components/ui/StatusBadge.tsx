/**
 * components/ui/StatusBadge.tsx
 * -----------------------------------------------------------------------------
 * PASSED / FAILED / PENDING badge. Written once and reused by the settlement
 * matrix, the capture ledger and the freelancer panel.
 * -----------------------------------------------------------------------------
 */

export type StatusValue = 'PASSED' | 'FAILED' | 'PENDING' | 'COMPLETED';

const STATUS_STYLES: Record<StatusValue, { color: string; background: string }> = {
  PASSED: { color: '#4ade80', background: 'rgba(34,197,94,0.12)' },
  COMPLETED: { color: '#4ade80', background: 'rgba(34,197,94,0.12)' },
  FAILED: { color: '#f87171', background: 'rgba(239,68,68,0.12)' },
  PENDING: { color: '#8b8ba0', background: 'rgba(139,139,160,0.12)' },
};

export interface StatusBadgeProps {
  status: StatusValue;
  label?: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const styles = STATUS_STYLES[status];

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 9px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: styles.color,
        background: styles.background,
        whiteSpace: 'nowrap',
      }}
    >
      {label ?? status}
    </span>
  );
}
