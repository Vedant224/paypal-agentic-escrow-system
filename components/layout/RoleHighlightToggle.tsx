/**
 * components/layout/RoleHighlightToggle.tsx
 * -----------------------------------------------------------------------------
 * Segmented control that highlights the active role's panel without hiding any
 * controls, per Requirement 13.2.
 * -----------------------------------------------------------------------------
 */
'use client';
import type { RoleFocus } from '@/types';

export interface RoleHighlightToggleProps {
  value: RoleFocus;
  onChange: (value: RoleFocus) => void;
}

const OPTIONS: ReadonlyArray<{ value: RoleFocus; label: string }> = [
  { value: 'all', label: 'All Roles View' },
  { value: 'client', label: 'Client Focus' },
  { value: 'freelancer', label: 'Freelancer Focus' },
];

export function RoleHighlightToggle({ value, onChange }: RoleHighlightToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Role focus"
      style={{
        display: 'inline-flex',
        gap: '4px',
        padding: '4px',
        background: '#0b0b12',
        border: '1px solid #1e1e2a',
        borderRadius: '999px',
      }}
    >
      {OPTIONS.map((option) => {
        const isActive = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(option.value)}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 600,
              fontFamily: 'inherit',
              color: isActive ? '#ffffff' : '#8b8ba0',
              background: isActive ? '#2563eb' : 'transparent',
              border: '1px solid transparent',
              borderRadius: '999px',
              cursor: 'pointer',
              transition: 'background 150ms ease, color 150ms ease',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
