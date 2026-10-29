/**
 * lib/verification-engine.ts
 * -----------------------------------------------------------------------------
 * Deterministic assertion interpreter.
 *
 * There is no `eval()` and no `new Function()` anywhere: assertions are
 * executed through an exhaustive `switch` over the `type` discriminator, so an
 * unhandled variant is a compile-time error rather than a runtime surprise.
 *
 * Two invariants matter most:
 *  1. `http_status_ok` uses `page.request.get()` so the active page is never
 *     navigated away from mid-run.
 *  2. Assertions are sorted so `http_status_ok` always executes last, as a
 *     belt-and-braces second line of defence.
 * -----------------------------------------------------------------------------
 */
import type { Page } from 'playwright';
import type { AssertionPrimitive } from './schemas';
import { VerificationEngineError } from './errors';
import { sanitizeTelemetry } from './sanitize';

const FILE_NAME = 'verification-engine.ts';

export interface VerificationResult {
  criterionId: string;
  passed: boolean;
  actualResult: string;
  skipped: boolean;
}

export interface AssertionOutcome {
  passed: boolean;
  actualResult: string;
}

/**
 * Execution priority per assertion type. `http_status_ok` is deliberately last.
 */
export const EXECUTION_ORDER: Record<AssertionPrimitive['type'], number> = {
  dom_exists: 1,
  text_contains: 2,
  computed_style: 3,
  no_horizontal_overflow: 4,
  http_status_ok: 5,
};

export const ASSERTION_TIMEOUT_MS = 10_000;
const DEFAULT_VIEWPORT = { width: 1280, height: 800 } as const;

/**
 * Sort criteria into deterministic execution order without mutating the input.
 */
export function sortCriteriaForExecution<T extends { assertion: AssertionPrimitive }>(
  items: T[],
): T[] {
  return [...items].sort(
    (a, b) => EXECUTION_ORDER[a.assertion.type] - EXECUTION_ORDER[b.assertion.type],
  );
}

/**
 * Execute a single assertion against the current page.
 *
 * Throws `VerificationEngineError` for an unhandled assertion variant.
 */
export async function executeAssertion(
  page: Page,
  assertion: AssertionPrimitive,
): Promise<AssertionOutcome> {
  const fnName = `${FILE_NAME}::executeAssertion`;

  switch (assertion.type) {
    case 'dom_exists': {
      const count = await page.locator(assertion.selector).count();
      return {
        passed: count >= 1,
        actualResult: `Found ${count} element(s) matching "${assertion.selector}"`,
      };
    }

    case 'text_contains': {
      const locator = page.locator(assertion.selector).first();
      const count = await locator.count();

      if (count === 0) {
        return {
          passed: false,
          actualResult: `Selector "${assertion.selector}" not found in DOM`,
        };
      }

      const text = await locator.innerText();
      const passed = text.toLowerCase().includes(assertion.expectedValue.toLowerCase());

      return {
        passed,
        actualResult: passed
          ? `Text contains "${assertion.expectedValue}"`
          : `Expected "${assertion.expectedValue}" inside "${text.slice(0, 80)}"`,
      };
    }

    case 'computed_style': {
      const locator = page.locator(assertion.selector).first();
      const count = await locator.count();

      if (count === 0) {
        return {
          passed: false,
          actualResult: `Element not found: "${assertion.selector}"`,
        };
      }

      const computedValue = await locator.evaluate(
        (element, property) => window.getComputedStyle(element).getPropertyValue(property),
        assertion.property,
      );

      const passed = computedValue.trim() === assertion.expectedValue.trim();

      return {
        passed,
        actualResult: passed
          ? `${assertion.property}: ${computedValue}`
          : `Expected ${assertion.property}="${assertion.expectedValue}" but got "${computedValue}"`,
      };
    }

    case 'no_horizontal_overflow': {
      await page.setViewportSize({ width: assertion.viewportWidth, height: 812 });

      try {
        const { scrollWidth, innerWidth } = await page.evaluate(() => ({
          scrollWidth: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
          innerWidth: window.innerWidth,
        }));

        const passed = scrollWidth <= innerWidth;

        return {
          passed,
          actualResult: passed
            ? `No overflow at ${assertion.viewportWidth}px (scroll: ${scrollWidth}px <= viewport: ${innerWidth}px)`
            : `Horizontal overflow: scrollWidth ${scrollWidth}px > viewport ${innerWidth}px`,
        };
      } finally {
        // Always restore the standard desktop viewport for later assertions.
        await page.setViewportSize(DEFAULT_VIEWPORT);
      }
    }

    case 'http_status_ok': {
      // Non-navigational HTTP check: the DOM context is never mutated.
      const response = await page.request.get(assertion.url);
      const status = response.status();
      const passed = status >= 200 && status <= 299;

      return {
        passed,
        actualResult: `HTTP ${status} (${assertion.url})`,
      };
    }

    default: {
      const exhaustive: never = assertion;
      throw new VerificationEngineError(
        'executeAssertion',
        `Unhandled assertion variant: ${JSON.stringify(exhaustive)}`,
      );
    }
  }
}

/**
 * Execute an assertion with a hard 10 second timeout. Any failure — timeout,
 * selector error, engine error — is converted into a FAILED result carrying
 * the error message as telemetry, so one bad assertion can never abort a run.
 */
export async function executeAssertionSafe(
  page: Page,
  criterionId: string,
  assertion: AssertionPrimitive,
): Promise<VerificationResult> {
  const fnName = `${FILE_NAME}::executeAssertionSafe`;

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new VerificationEngineError(
            'executeAssertionSafe',
            `Assertion timed out after ${ASSERTION_TIMEOUT_MS}ms`,
            'VERIFICATION_TIMEOUT',
            { criterionId, assertionType: assertion.type },
          ),
        );
      }, ASSERTION_TIMEOUT_MS);
    });

    const outcome = await Promise.race([executeAssertion(page, assertion), timeoutPromise]);

    return {
      criterionId,
      passed: outcome.passed,
      actualResult: sanitizeTelemetry(outcome.actualResult),
      skipped: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      criterionId,
      passed: false,
      actualResult: sanitizeTelemetry(`Error: ${message}`),
      skipped: false,
    };
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
    void fnName;
  }
}
