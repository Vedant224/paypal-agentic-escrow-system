/**
 * tests/e2e-dashboard.ts
 * -----------------------------------------------------------------------------
 * End-to-end dashboard check driven by Playwright directly (no browser daemon),
 * so it is fully deterministic in CI.
 *
 * Run with:  npx tsx tests/e2e-dashboard.ts
 * Requires:  a Next.js server already listening on DASHBOARD_URL.
 * -----------------------------------------------------------------------------
 */
import { chromium } from 'playwright';
import type { Page } from 'playwright';

const BASE_URL = process.env.DASHBOARD_URL ?? 'http://127.0.0.1:3116';

interface Check {
  name: string;
  passed: boolean;
  detail: string;
}

const checks: Check[] = [];

function record(name: string, passed: boolean, detail: string): void {
  checks.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name} :: ${detail}`);
}

async function waitForServer(page: Page): Promise<void> {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const response = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 10_000 });
      if (response !== null && response.ok()) {
        return;
      }
    } catch {
      // server not up yet
    }
    await page.waitForTimeout(1000);
  }

  throw new Error(`Server at ${BASE_URL} never became reachable`);
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await waitForServer(page);

    // Capture ALL client-side output so hydration failures are visible.
    const jsErrors: string[] = [];
    const allConsole: string[] = [];
    page.on('pageerror', (error) => jsErrors.push(error.message));
    page.on('console', (message) => {
      allConsole.push(`[${message.type()}] ${message.text()}`);
      if (message.type() === 'error') {
        jsErrors.push(`[${message.type()}] ${message.text()}`);
      }
    });

    const hydratedInfo = await page.evaluate(() => {
      const win = window as unknown as Record<string, unknown>;
      return {
        hasNextData: typeof win.__NEXT_DATA__ !== 'undefined',
        hasReact: typeof win.React !== 'undefined',
        hasNext: typeof win.__next !== 'undefined',
        reactRoot: document.querySelector('[data-reactroot]') !== null,
        nextRootId: document.getElementById('__next')?.getAttribute('id'),
        scripts: Array.from(document.querySelectorAll('script[src]')).map((s) => s.getAttribute('src')),
        bodyInnerHTMLLen: document.body.innerHTML.length,
        scriptsLoaded: Array.from(document.querySelectorAll('script[src]')).every((s) => !s.getAttribute('src')?.includes('error')),
      };
    });
    console.log('HYDRATION INFO:', JSON.stringify(hydratedInfo));

    // --- Dashboard shell renders ------------------------------------------
    // Hydrate patiently and snapshot intermediate body text to diagnose stalls.
    let hydrated = false;
    for (let attempt = 1; attempt <= 45; attempt += 1) {
      await page.waitForTimeout(1000);
      const gridCount = await page.evaluate(() => document.querySelectorAll('.ag-row').length);
      const bodySnippet = await page
        .evaluate(() => document.body.textContent?.slice(0, 120))
        .catch(() => null);

      if (gridCount > 0) {
        hydrated = true;
        break;
      }

      if (attempt % 15 === 0) {
        console.log(
          `Still waiting after ${attempt}s; jsErrors=${JSON.stringify(jsErrors)}; body starts: ${JSON.stringify(bodySnippet)}`,
        );
      }
    }

    if (!hydrated) {
      const finalBody = await page.evaluate(() => document.body.textContent?.slice(0, 400));
      console.log('FINAL BODY (never hydrated):', JSON.stringify(finalBody));
      throw new Error('Dashboard never hydrated the settlement matrix');
    }

    const headings = await page.$$eval('h1, h2', (nodes) =>
      nodes.map((node) => (node.textContent ?? '').trim()),
    );
    record(
      'dashboard renders all panels',
      ['Client', 'Freelancer', 'Settlement matrix', 'Capture ledger', 'Agent telemetry'].every(
        (heading) => headings.includes(heading),
      ),
      headings.join(' | '),
    );

    // --- Settlement matrix has 5 criteria x 9 columns ---------------------
    const rowCount = await page.$$eval('.ag-center-cols-container .ag-row', (rows) => rows.length);
    const cellCounts = await page.$$eval('.ag-center-cols-container .ag-row', (rows) =>
      rows.map((row) => row.querySelectorAll('.ag-cell').length),
    );
    record(
      'settlement matrix shows 5 criteria',
      rowCount === 5,
      `${rowCount} rows`,
    );
    record(
      'every criterion row has 9 columns',
      cellCounts.length === 5 && cellCounts.every((count) => count === 9),
      `cells per row: ${cellCounts.join(',')}`,
    );

    const gridHeaders = await page.$$eval('.ag-header-cell-text', (nodes) =>
      nodes.map((node) => (node.textContent ?? '').trim()),
    );
    const expectedHeaders = [
      'Type',
      'Description',
      'Target',
      'Expected Value',
      'Weight %',
      'Dollar Value',
      'Status',
      'Actual Telemetry Result',
      'Capture ID',
    ];
    record(
      'settlement matrix has the required columns',
      expectedHeaders.every((header) => gridHeaders.includes(header)),
      gridHeaders.join(' | '),
    );

    // --- Summary bar figures ----------------------------------------------
    const summary = await page.evaluate(() => {
      const out: string[] = [];
      document.querySelectorAll('div').forEach((node) => {
        const text = (node.textContent ?? '').trim();
        if (
          ['Total authorized', 'Total captured', 'Held in escrow', 'Pass percentage'].includes(text) &&
          node.children.length === 0
        ) {
          const parent = node.parentElement;
          if (parent !== null) {
            out.push((parent.textContent ?? '').trim());
          }
        }
      });
      return out;
    });
    record(
      'summary bar shows the escrow figures',
      summary.some((entry) => entry.includes('$100.00')) &&
        summary.some((entry) => entry.includes('Pass percentage')),
      summary.join(' | '),
    );

    // --- Role focus dims the inactive panel --------------------------------
    const readRoleState = async () =>
      page.evaluate(() => {
        const client = document.querySelector('[data-role="client"]');
        const freelancer = document.querySelector('[data-role="freelancer"]');
        return {
          clientDimmed: client?.getAttribute('data-dimmed') ?? null,
          freelancerDimmed: freelancer?.getAttribute('data-dimmed') ?? null,
          clientHighlighted: client?.getAttribute('data-highlighted') ?? null,
          clientOpacity: client === null ? null : Number(getComputedStyle(client).opacity),
          freelancerOpacity:
            freelancer === null ? null : Number(getComputedStyle(freelancer).opacity),
        };
      });

    const baseline = await readRoleState();
    record(
      'all roles view leaves both panels active',
      baseline.clientDimmed === 'false' && baseline.freelancerDimmed === 'false',
      JSON.stringify(baseline),
    );

    await page.click('[role="radio"]:has-text("Freelancer Focus")');
    await page.waitForTimeout(600);

    const freelancerFocus = await readRoleState();
    record(
      'freelancer focus dims the client panel',
      freelancerFocus.clientDimmed === 'true' &&
        freelancerFocus.freelancerDimmed === 'false' &&
        (freelancerFocus.clientOpacity ?? 1) < 1,
      JSON.stringify(freelancerFocus),
    );

    await page.click('[role="radio"]:has-text("Client Focus")');
    await page.waitForTimeout(600);

    const clientFocus = await readRoleState();
    record(
      'client focus dims the freelancer panel',
      clientFocus.clientDimmed === 'false' &&
        clientFocus.freelancerDimmed === 'true' &&
        (clientFocus.freelancerOpacity ?? 1) < 1,
      JSON.stringify(clientFocus),
    );

    await page.click('[role="radio"]:has-text("All Roles View")');
    await page.waitForTimeout(600);

    // --- Demo preset populates the deployment URL -------------------------
    // Each preset row shows "Test vN-..." text next to a "Run" button.
    const presetRowCount = await page.locator('div:has-text("Test v1-broken")').count();
    record(
      'demo preset buttons are present',
      presetRowCount > 0,
      `${presetRowCount} preset rows found`,
    );

    const urlBefore = await page.$eval(
      'input[value*="/demo/"]',
      (node) => (node as HTMLInputElement).value,
    );
    await page
      .locator('div:has-text("Test v2-fixed")')
      .locator('button:has-text("Run")')
      .last()
      .click();
    await page.waitForTimeout(400);
    const urlAfter = await page.$eval(
      'input[value*="/demo/"]',
      (node) => (node as HTMLInputElement).value,
    );
    record(
      'demo preset switches the deployment URL',
      urlBefore.includes('v1-broken') && urlAfter.includes('v2-fixed'),
      `${urlBefore} -> ${urlAfter}`,
    );

    // --- Sandbox credentials pills ----------------------------------------
    const hasEmailPill = await page.$('button:has-text("Email:")');
    const hasPasswordPill = await page.$('button:has-text("Copy password")');
    record(
      'sandbox buyer credentials are copyable',
      hasEmailPill !== null && hasPasswordPill !== null,
      `email=${hasEmailPill !== null} password=${hasPasswordPill !== null}`,
    );

    // --- No error boundary fallbacks --------------------------------------
    const bodyText = (await page.textContent('body')) ?? '';
    const failed = [
      'Client panel failed to load',
      'Freelancer panel failed to load',
      'Settlement matrix failed to load',
      'Capture ledger failed to load',
      'Telemetry failed to load',
    ].filter((message) => bodyText.includes(message));
    record('no error boundary fallbacks rendered', failed.length === 0, failed.join(',') || 'none');

    // --- Demo pages behave as specified -----------------------------------
    for (const [route, expectedButtonColor] of [
      ['v1-broken', 'rgb(0, 0, 255)'],
      ['v2-fixed', 'rgb(34, 139, 34)'],
    ] as const) {
      await page.goto(`${BASE_URL}/demo/${route}`, { waitUntil: 'domcontentloaded' });

      // Match the verification engine's mobile viewport for the overflow check.
      await page.setViewportSize({ width: 375, height: 812 });

      const heading = await page.$('#main-heading');
      const welcome = await page.$('.welcome-text');
      const button = await page.$('.primary-button');
      const color = button === null ? null : await button.evaluate((node) => getComputedStyle(node).backgroundColor);
      const overflow = await page.evaluate(() => ({
        scroll: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
        inner: window.innerWidth,
      }));

      record(
        `demo ${route} renders the contracted elements`,
        heading !== null && welcome !== null && button !== null,
        `heading=${heading !== null} welcome=${welcome !== null} button=${button !== null}`,
      );
      record(
        `demo ${route} button colour is ${expectedButtonColor}`,
        color === expectedButtonColor,
        `actual=${color}`,
      );
      record(
        `demo ${route} has no horizontal overflow at 375px`,
        overflow.scroll <= 375,
        `scroll=${overflow.scroll} inner=${overflow.inner}`,
      );
    }

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('.ag-row').length > 0, {
      timeout: 60_000,
    });
    await page.screenshot({ path: 'dashboard.png', fullPage: true });
    console.log('SCREENSHOT=dashboard.png');

    // Report any JS errors that surfaced during hydration.
    if (jsErrors.length > 0) {
      console.log('JS ERRORS DURING HYDRATION:');
      jsErrors.forEach((err) => console.log('  -', err));
    }
  } finally {
    await browser.close();
  }

  const failedChecks = checks.filter((check) => !check.passed);
  console.log(`\n${checks.length - failedChecks.length}/${checks.length} checks passed`);

  if (failedChecks.length > 0) {
    process.exitCode = 1;
  }
}

void main();
