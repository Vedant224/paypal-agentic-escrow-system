/**
 * components/ui/Button.tsx
 * -----------------------------------------------------------------------------
 * The single button primitive. Variants cover the primary, secondary and
 * destructive actions used across every panel.
 * -----------------------------------------------------------------------------
 */
'use client';
import { forwardRef } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: '#2563eb',
  secondary: '#15151f',
  destructive: '#dc2626',
  ghost: 'transparent',
};

const SIZE_STYLES: Record<ButtonSize, { padding: string; fontSize: string }> = {
  sm: { padding: '6px 12px', fontSize: '13px' },
  md: { padding: '9px 16px', fontSize: '14px' },
  lg: { padding: '12px 22px', fontSize: '15px' },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    isLoading = false,
    disabled,
    children,
    style,
    ...rest
  },
  ref,
) {
  const sizing = SIZE_STYLES[size];

  return (
    <button
      ref={ref}
      disabled={disabled === true || isLoading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: sizing.padding,
        fontSize: sizing.fontSize,
        fontWeight: 600,
        fontFamily: 'inherit',
        color: variant === 'destructive' ? '#ffffff' : variant === 'ghost' ? '#8b8ba0' : '#ffffff',
        background:
          variant === 'ghost'
            ? 'transparent'
            : variant === 'secondary'
              ? `linear-gradient(${VARIANT_STYLES.secondary}, ${VARIANT_STYLES.secondary})`
              : `linear-gradient(${VARIANT_STYLES[variant]}, ${VARIANT_STYLES[variant]})`,
        border:
          variant === 'secondary' || variant === 'ghost'
            ? '1px solid #26263a'
            : '1px solid transparent',
        borderRadius: '8px',
        cursor: disabled === true || isLoading ? 'not-allowed' : 'pointer',
        opacity: disabled === true ? 0.55 : 1,
        transition: 'filter 150ms ease, opacity 150ms ease',
        ...style,
      }}
      onMouseEnter={(event) => {
        if (disabled !== true && !isLoading) {
          event.currentTarget.style.filter = 'brightness(1.12)';
        }
        rest.onMouseEnter?.(event);
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.filter = 'none';
        rest.onMouseLeave?.(event);
      }}
      {...rest}
    >
      {isLoading ? <Spinner /> : null}
      {children}
    </button>
  );
});

/** Kept here to avoid a circular import between Button and Spinner. */
function Spinner() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: '13px',
        height: '13px',
        borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.35)',
        borderTopColor: '#ffffff',
        animation: 'spin 700ms linear infinite',
      }}
    />
  );
}
