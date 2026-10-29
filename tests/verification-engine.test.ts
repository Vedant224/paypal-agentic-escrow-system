import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import {
  executeAssertion,
  executeAssertionSafe,
  sortCriteriaForExecution,
  EXECUTION_ORDER,
} from '@/lib/verification-engine';
import type { AssertionPrimitive } from '@/lib/schemas';

const assertions: AssertionPrimitive[] = [
  { type: 'dom_exists', description: 'heading', selector: '#main-heading', weight: 20 },
  {
    type: 'text_contains',
    description: 'copy',
    selector: '.welcome-text',
    expectedValue: 'task management',
    weight: 20,
  },
  {
    type: 'computed_style',
    description: 'button colour',
    selector: '.primary-button',
    property: 'background-color',
    expectedValue: 'rgb(34, 139, 34)',
    weight: 20,
  },
  { type: 'no_horizontal_overflow', description: 'responsive', viewportWidth: 375, weight: 20 },
  { type: 'http_status_ok', description: 'reachable', url: 'https://example.com', weight: 20 },
];

describe('sortCriteriaForExecution', () => {
  it('puts http_status_ok last regardless of input order', () => {
    const shuffled = [
      { assertion: assertions[4] as AssertionPrimitive },
      { assertion: assertions[0] as AssertionPrimitive },
      { assertion: assertions[3] as AssertionPrimitive },
    ];

    const sorted = sortCriteriaForExecution(shuffled);
    expect(sorted[sorted.length - 1]?.assertion.type).toBe('http_status_ok');
  });

  it('does not mutate the input array', () => {
    const input = [
      { assertion: assertions[4] as AssertionPrimitive },
      { assertion: assertions[0] as AssertionPrimitive },
    ];
    const before = input.map((i) => i.assertion.type);
    sortCriteriaForExecution(input);
    expect(input.map((i) => i.assertion.type)).toEqual(before);
  });

  it('orders by the documented priority', () => {
    expect(EXECUTION_ORDER.dom_exists).toBeLessThan(EXECUTION_ORDER.text_contains);
    expect(EXECUTION_ORDER.text_contains).toBeLessThan(EXECUTION_ORDER.computed_style);
    expect(EXECUTION_ORDER.computed_style).toBeLessThan(EXECUTION_ORDER.no_horizontal_overflow);
    expect(EXECUTION_ORDER.no_horizontal_overflow).toBeLessThan(EXECUTION_ORDER.http_status_ok);
  });
});

describe('executeAssertion against a real page', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.setContent(`
      <html>
        <body style="margin:0">
          <h1 id="main-heading">Task Management</h1>
          <p class="welcome-text">Welcome to our task management suite</p>
          <button class="primary-button" style="background-color: rgb(34, 139, 34); width: 200px;">Go</button>
          <div class="wide-banner" style="width: 900px; height: 20px; background: #333;"></div>
        </body>
      </html>
    `);
  });

  afterAll(async () => {
    await browser.close();
  });

  it('passes a dom_exists assertion', async () => {
    const result = await executeAssertion(page, assertions[0] as AssertionPrimitive);
    expect(result.passed).toBe(true);
  });

  it('fails a dom_exists assertion for a missing selector', async () => {
    const result = await executeAssertion(page, {
      type: 'dom_exists',
      description: 'missing',
      selector: '#does-not-exist',
      weight: 20,
    });
    expect(result.passed).toBe(false);
  });

  it('matches text case-insensitively', async () => {
    const result = await executeAssertion(page, {
      type: 'text_contains',
      description: 'copy',
      selector: '.welcome-text',
      expectedValue: 'TASK MANAGEMENT',
      weight: 20,
    });
    expect(result.passed).toBe(true);
  });

  it('reads the computed style of an element', async () => {
    const result = await executeAssertion(page, assertions[2] as AssertionPrimitive);
    expect(result.passed).toBe(true);
  });

  it('detects horizontal overflow', async () => {
    const result = await executeAssertion(page, {
      type: 'no_horizontal_overflow',
      description: 'overflow',
      viewportWidth: 375,
      weight: 20,
    });
    expect(result.passed).toBe(false);
  });

  it('checks HTTP status without navigating the page away', async () => {
    const before = page.url();
    const result = await executeAssertion(page, {
      type: 'http_status_ok',
      description: 'reachable',
      url: 'https://example.com',
      weight: 20,
    });

    expect(result.passed).toBe(true);
    expect(result.actualResult).toContain('HTTP 2');
    // The page must still be where it was — the whole point of page.request.get.
    expect(page.url()).toBe(before);
  });

  it('reports a failing HTTP status', async () => {
    const result = await executeAssertion(page, {
      type: 'http_status_ok',
      description: 'missing',
      url: 'https://example.com/definitely-not-a-real-path-xyz',
      weight: 20,
    });
    expect(result.passed).toBe(false);
  });

  it('converts a thrown error into a FAILED result via executeAssertionSafe', async () => {
    const result = await executeAssertionSafe(page, 'criterion-1', {
      type: 'dom_exists',
      description: 'bad selector',
      selector: '>>>invalid<<<',
      weight: 20,
    });

    expect(result.passed).toBe(false);
    expect(result.skipped).toBe(false);
    expect(result.actualResult).toContain('Error:');
  });
});
