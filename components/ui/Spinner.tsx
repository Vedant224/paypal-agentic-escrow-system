/**
 * components/ui/Spinner.tsx
 * -----------------------------------------------------------------------------
 * The single loading spinner used in every async button and panel. Never
 * inline a spinner anywhere else.
 * -----------------------------------------------------------------------------
 */
'use client';

export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps {
  size?: SpinnerSize;
  label?: string;
}

const DIMENSIONS: Record<SpinnerSize, number> = {
  sm: 14,
  md: 20,
  lg: 28,
};

export function Spinner({ size = 'md', label }: SpinnerProps) {
  const dimension = DIMENSIONS[size];

  return (
    <span
      role="status"
      aria-label={label ?? 'Loading'}
      style={{
        display: 'inline-block',
        width: dimension,
        height: dimension,
        borderRadius: '50%',
        border: `2px solid #26263a`,
        borderTopColor: '#38bdf8',
        animation: 'spin 700ms linear infinite',
        flexShrink: 0,
      }}
    />
  );
}
