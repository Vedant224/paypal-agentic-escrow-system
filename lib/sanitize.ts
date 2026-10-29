/**
 * lib/sanitize.ts
 * -----------------------------------------------------------------------------
 * Input hardening: SSRF-safe deployment URL validation and CSS selector
 * sanitisation. Both validators are used before any user-supplied value is
 * handed to Playwright.
 * -----------------------------------------------------------------------------
 */
import { z } from 'zod';

const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
  '169.254.169.254',
  'metadata.google',
  'metadata.google.internal',
]);

const PRIVATE_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
];

const DANGEROUS_SELECTOR_PATTERN =
  /javascript:|expression\(|url\(|eval\(|import\(|@import|<script/i;

const MAX_SELECTOR_LENGTH = 250;

/**
 * The two official demo routes are the only internal URLs the verification
 * engine is allowed to navigate to. They are explicitly whitelisted so the
 * hackathon demo works end-to-end on localhost without opening an SSRF hole
 * for arbitrary loopback hosts.
 */
function isOfficialDemoRoute(parsed: URL): boolean {
  const allowedHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  const allowedPaths = new Set(['/demo/v1-broken', '/demo/v2-fixed']);

  // Demo paths on loopback are explicitly permitted during local/preview
  // testing, on any port. Everything else on loopback stays blocked.
  return allowedHosts.has(parsed.hostname.toLowerCase()) && allowedPaths.has(parsed.pathname);
}

export function isAllowedVerificationUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    if (isOfficialDemoRoute(parsed)) {
      return true;
    }

    const hostname = parsed.hostname.toLowerCase();

    if (BLOCKED_HOSTS.has(hostname)) {
      return false;
    }

    if (PRIVATE_IP_RANGES.some((range) => range.test(hostname))) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export const DeploymentUrlSchema = z
  .string()
  .url('Must be a valid URL')
  .refine(
    isAllowedVerificationUrl,
    'URL must be a public HTTP/HTTPS address or an official /demo/* route',
  );

/**
 * Reject selectors that could smuggle script or expression payloads into
 * Playwright, and cap the length so a pathological selector cannot be used to
 * burn CPU during evaluation.
 */
export function isSafeSelector(selector: string): boolean {
  if (typeof selector !== 'string') {
    return false;
  }

  const trimmed = selector.trim();

  if (trimmed.length === 0 || trimmed.length > MAX_SELECTOR_LENGTH) {
    return false;
  }

  return !DANGEROUS_SELECTOR_PATTERN.test(trimmed);
}

export const SafeSelectorSchema = z
  .string()
  .min(1, 'Selector must not be empty')
  .max(MAX_SELECTOR_LENGTH, 'Selector must be 250 characters or fewer')
  .refine(isSafeSelector, 'Unsafe or invalid CSS selector');

/**
 * Strip anything that could be interpreted as markup from telemetry strings
 * before they are persisted or rendered inside the grid.
 */
export function sanitizeTelemetry(value: string): string {
  return value
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .slice(0, 500);
}
