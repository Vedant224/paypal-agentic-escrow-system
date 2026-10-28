/**
 * lib/pretty-printer.ts
 * -----------------------------------------------------------------------------
 * Deterministic JSON formatter: 2-space indentation with recursively sorted
 * object keys. The output is stable for a given input, which makes contracts
 * diffable and safe to hash for audit trails.
 * -----------------------------------------------------------------------------
 */

/**
 * Recursively sort object keys so two structurally equal contracts always
 * serialise to the exact same string.
 */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }

  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );

    const sorted: Record<string, unknown> = {};
    for (const [key, entryValue] of entries) {
      sorted[key] = sortKeys(entryValue);
    }

    return sorted;
  }

  return value;
}

/**
 * Pretty-print any JSON-serialisable value with 2-space indentation and
 * recursively sorted keys.
 */
export function prettyPrint(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2);
}

/**
 * Pretty-print an escrow contract (or any contract-shaped object).
 */
export function prettyPrintContract(contract: unknown): string {
  return prettyPrint(contract);
}

/**
 * Pretty-print an array of assertion primitives.
 */
export function prettyPrintAssertions(assertions: unknown): string {
  return prettyPrint(assertions);
}
