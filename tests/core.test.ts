import { describe, expect, it } from 'vitest';
import {
  allocateCriterionCents,
  AssertionPrimitiveSchema,
  validateAssertionWeights,
} from '@/lib/schemas';
import { parseAssertionContract } from '@/lib/parser';
import { ParserError } from '@/lib/errors';
import { prettyPrintContract } from '@/lib/pretty-printer';
import { formatCentsToPayPalValue, formatUSD } from '@/lib/format';
import { isAllowedVerificationUrl, isSafeSelector } from '@/lib/sanitize';
import { redact } from '@/lib/trace';

const assertions = [
  { type: 'dom_exists', description: 'heading', selector: '#main-heading', weight: 20 },
  { type: 'text_contains', description: 'copy', selector: '.welcome-text', expectedValue: 'task management', weight: 20 },
  { type: 'no_horizontal_overflow', description: 'responsive', viewportWidth: 375, weight: 20 },
  {
    type: 'computed_style',
    description: 'button colour',
    selector: '.primary-button',
    property: 'background-color',
    expectedValue: 'rgb(34, 139, 34)',
    weight: 20,
  },
  { type: 'http_status_ok', description: 'reachable', url: 'https://example.com/health', weight: 20 },
] as const;

describe('assertion weights and cent allocation', () => {
  it('accepts weights that sum to exactly 100', () => {
    expect(validateAssertionWeights([...assertions])).toBe(true);
  });

  it('rejects weights that do not sum to 100', () => {
    const broken = [{ ...assertions[0], weight: 30 }];
    expect(validateAssertionWeights(broken)).toBe(false);
  });

  it('allocates cents that sum exactly to the total budget', () => {
    const allocations = allocateCriterionCents([...assertions], 10_000);
    expect(allocations.reduce((acc, value) => acc + value, 0)).toBe(10_000);
    expect(allocations).toEqual([2_000, 2_000, 2_000, 2_000, 2_000]);
  });

  it('absorps rounding remainder in the final criterion', () => {
    const uneven = [
      { ...assertions[0], weight: 33 },
      { ...assertions[1], weight: 33 },
      { ...assertions[2], weight: 33 },
      { ...assertions[3], weight: 0.5 },
      { ...assertions[4], weight: 0.5 },
    ];
    const allocations = allocateCriterionCents(uneven as never, 10_001);
    expect(allocations.reduce((acc, value) => acc + value, 0)).toBe(10_001);
  });
});

describe('parse / pretty-print round trip', () => {
  const contract = {
    id: '11111111-1111-4111-8111-111111111111',
    clientId: 'demo-client-1',
    projectRequirements: 'Build a task management landing page',
    assertions,
    totalBudgetCents: 10_000,
    currency: 'USD',
    status: 'DRAFT',
    verificationInProgress: false,
  };

  it('parses a valid contract', () => {
    const parsed = parseAssertionContract(JSON.stringify(contract));
    expect(parsed.assertions).toHaveLength(5);
    expect(parsed.status).toBe('DRAFT');
  });

  it('round trips parse -> prettyPrint -> parse into an equivalent object', () => {
    const first = parseAssertionContract(JSON.stringify(contract));
    const printed = prettyPrintContract(first);
    const second = parseAssertionContract(printed);
    expect(second).toEqual(first);
  });

  it('sorts object keys deterministically', () => {
    const printed = prettyPrintContract({ b: 1, a: { d: 2, c: 3 } });
    expect(printed).toBe('{\n  "a": {\n    "c": 3,\n    "d": 2\n  },\n  "b": 1\n}');
  });

  it('throws ParserError on malformed JSON', () => {
    expect(() => parseAssertionContract('{not json')).toThrow(ParserError);
  });

  it('throws ParserError when the schema does not match', () => {
    expect(() => parseAssertionContract(JSON.stringify({ id: 'nope' }))).toThrow(ParserError);
  });
});

describe('assertion schema rejects unsafe selectors', () => {
  it('rejects javascript: selectors', () => {
    const result = AssertionPrimitiveSchema.safeParse({
      type: 'dom_exists',
      description: 'bad',
      selector: 'javascript:alert(1)',
      weight: 20,
    });
    expect(result.success).toBe(false);
  });
});

describe('money formatting', () => {
  it('formats cents as USD', () => {
    expect(formatUSD(8_000)).toBe('$80.00');
    expect(formatUSD(10_000)).toBe('$100.00');
    expect(formatUSD(0)).toBe('$0.00');
  });

  it('formats cents as a PayPal decimal string', () => {
    expect(formatCentsToPayPalValue(8_000)).toBe('80.00');
    expect(formatCentsToPayPalValue(5)).toBe('0.05');
    expect(formatCentsToPayPalValue(100)).toBe('1.00');
  });
});

describe('SSRF and selector sanitisation', () => {
  it('blocks private and loopback hosts', () => {
    expect(isAllowedVerificationUrl('http://127.0.0.1:3000/anything')).toBe(false);
    expect(isAllowedVerificationUrl('http://localhost:3000/anything')).toBe(false);
    expect(isAllowedVerificationUrl('http://192.168.1.10/')).toBe(false);
    expect(isAllowedVerificationUrl('http://169.254.169.254/latest/meta-data')).toBe(false);
  });

  it('allows the official demo routes', () => {
    expect(isAllowedVerificationUrl('http://localhost:3000/demo/v1-broken')).toBe(true);
    expect(isAllowedVerificationUrl('http://localhost:3000/demo/v2-fixed')).toBe(true);
  });

  it('allows public https urls', () => {
    expect(isAllowedVerificationUrl('https://example.com/')).toBe(true);
  });

  it('rejects dangerous selectors', () => {
    expect(isSafeSelector('#main-heading')).toBe(true);
    expect(isSafeSelector('javascript:alert(1)')).toBe(false);
    expect(isSafeSelector('div[style*="expression("]')).toBe(false);
  });
});

describe('log redaction', () => {
  it('redacts sensitive keys recursively', () => {
    const cleaned = redact({
      apiKey: 'sk-live-should-not-appear',
      nested: { clientSecret: 'super-secret', safe: 'visible' },
    });
    expect(cleaned.apiKey).toBe('[REDACTED]');
    expect((cleaned.nested as Record<string, unknown>).clientSecret).toBe('[REDACTED]');
    expect((cleaned.nested as Record<string, unknown>).safe).toBe('visible');
  });
});
