/**
 * components/ui/Input.tsx
 * -----------------------------------------------------------------------------
 * Labelled text input primitive.
 * -----------------------------------------------------------------------------
 */
'use client';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

export function Input({ label, hint, id, ...rest }: InputProps) {
  const inputId = id ?? `input-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <label
      htmlFor={inputId}
      style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
    >
      <span style={{ fontSize: '12px', fontWeight: 600, color: '#a9a9bd' }}>{label}</span>
      <input
        id={inputId}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '9px 12px',
          fontSize: '14px',
          fontFamily: 'inherit',
          color: '#e8e8f0',
          background: '#050508',
          border: '1px solid #26263a',
          borderRadius: '8px',
          outline: 'none',
        }}
        {...rest}
      />
      {hint !== undefined ? (
        <span style={{ fontSize: '11px', color: '#6d6d85' }}>{hint}</span>
      ) : null}
    </label>
  );
}
