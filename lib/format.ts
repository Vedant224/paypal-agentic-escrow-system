/**
 * lib/format.ts
 * -----------------------------------------------------------------------------
 * Single source of truth for money + percentage formatting. All monetary values
 * in this application are integer cents; conversion to dollars happens here and
 * nowhere else.
 * -----------------------------------------------------------------------------
 */

/**
 * Format an integer cent value as a USD string, e.g. `12345` -> `"$123.45"`.
 * Uses `Intl.NumberFormat` so thousands separators are handled correctly.
 */
export function formatUSD(cents: number): string {
  if (!Number.isFinite(cents)) {
    return '$0.00';
  }

  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(Math.trunc(cents));

  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absolute / 100);

  return `${sign}$${formatted}`;
}

/**
 * Convert integer cents into the decimal string PayPal expects, e.g.
 * `8000` -> `"80.00"`. Never performs floating point arithmetic.
 */
export function formatCentsToPayPalValue(cents: number): string {
  if (!Number.isFinite(cents)) {
    return '0.00';
  }

  const negative = cents < 0;
  const absolute = Math.abs(Math.trunc(cents));
  const dollars = Math.floor(absolute / 100);
  const remainder = absolute % 100;

  return `${negative ? '-' : ''}${dollars}.${String(remainder).padStart(2, '0')}`;
}

/**
 * Format a 0-100 percentage with one decimal place.
 */
export function formatPercentage(percentage: number): string {
  if (!Number.isFinite(percentage)) {
    return '0.0%';
  }

  return `${percentage.toFixed(1)}%`;
}

/**
 * Format an ISO timestamp for display, falling back to a dash when invalid.
 */
export function formatTimestamp(value: string | Date | null | undefined): string {
  if (value === null || value === undefined) {
    return '—';
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
