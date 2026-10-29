/**
 * lib/browser-connector.ts
 * -----------------------------------------------------------------------------
 * Browser acquisition for the verification engine.
 *
 * Primary path: connect to a remote Kernel cloud browser over CDP.
 * Fallback path: launch a local headless Chromium.
 *
 * Whichever path succeeds, the caller is responsible for closing the browser in
 * a `finally` block.
 * -----------------------------------------------------------------------------
 */
import { chromium } from 'playwright';
import type { Browser } from 'playwright';
import { BrowserConnectorError } from './errors';
import { env } from './env';
import { log } from './trace';

const FILE_NAME = 'browser-connector.ts';

/**
 * Connect to the configured Kernel CDP endpoint, or fall back to a locally
 * launched headless Chromium.
 */
export async function connectBrowser(traceId = 'browser-connector'): Promise<Browser> {
  const fnName = `${FILE_NAME}::connectBrowser`;

  if (env.KERNEL_WS_ENDPOINT !== undefined) {
    try {
      const browser = await chromium.connectOverCDP(env.KERNEL_WS_ENDPOINT);
      log('INFO', traceId, fnName, 'Connected to remote CDP browser');
      return browser;
    } catch (error) {
      log('WARN', traceId, fnName, 'CDP connection failed, falling back to local Chromium', {
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  try {
    const browser = await chromium.launch({ headless: true });
    log('INFO', traceId, fnName, 'Launched local headless Chromium');
    return browser;
  } catch (error) {
    throw new BrowserConnectorError(
      'connectBrowser',
      'Unable to acquire a browser via CDP or local launch',
      { hasKernelEndpoint: env.KERNEL_WS_ENDPOINT !== undefined },
      error,
    );
  }
}

/**
 * Close a browser, swallowing secondary errors so cleanup never masks the
 * original failure that triggered it.
 */
export async function closeBrowser(
  browser: Browser,
  traceId = 'browser-connector',
): Promise<void> {
  const fnName = `${FILE_NAME}::closeBrowser`;

  try {
    await browser.close();
  } catch (error) {
    log('WARN', traceId, fnName, 'Failed to close browser cleanly', {
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
