/**
 * lib/contract-compiler.ts
 * -----------------------------------------------------------------------------
 * Business logic for the Client_Agent (compile) and Freelancer_Agent (audit).
 *
 * Both agents use the Vercel AI SDK with structured outputs. When generation
 * fails after retries, the deterministic demo contract is returned so the
 * hackathon demo never breaks because of a flaky model call.
 * -----------------------------------------------------------------------------
 */
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import {
  AssertionPrimitiveSchema,
  allocateCriterionCents,
  validateAssertionWeights,
} from './schemas';
import type { AssertionPrimitive, AuditResult } from './schemas';
import { DEMO_ASSERTIONS } from './demo-seed';
import { AgentToolError } from './errors';
import { withRetry } from './retry';
import { log } from './trace';

const FILE_NAME = 'contract-compiler.ts';

const ASSERTION_COUNT = 5;

/**
 * Schema used for structured output. `weight` is emitted as an integer so the
 * 100% invariant can be checked without floating point drift.
 */
const GeneratedAssertionsSchema = z.object({
  assertions: z.array(AssertionPrimitiveSchema).length(ASSERTION_COUNT),
});

const GeneratedAuditSchema = z.object({
  approved: z.boolean(),
  issues: z
    .array(
      z.object({
        assertionIndex: z.number().int().min(0).max(ASSERTION_COUNT - 1),
        issue: z.string(),
      }),
    )
    .default([]),
  suggestedRevisions: z
    .array(
      z.object({
        assertionIndex: z.number().int().min(0).max(ASSERTION_COUNT - 1),
        revisedAssertion: AssertionPrimitiveSchema,
        rationale: z.string(),
      }),
    )
    .default([]),
});

const CLIENT_AGENT_SYSTEM_PROMPT = `You compile freelance project briefs into exactly 5 deterministic, machine-verifiable acceptance criteria.

Rules:
- Return exactly 5 assertions.
- Integer weights must sum to exactly 100.
- Use ONLY these assertion types: dom_exists, text_contains, no_horizontal_overflow, computed_style, http_status_ok.
- dom_exists and computed_style require a CSS selector (no IDs generated at runtime, no placeholder text).
- text_contains requires a selector and a concrete expected substring.
- no_horizontal_overflow requires an integer viewportWidth between 320 and 3840.
- http_status_ok requires a full http/https URL.
- Never use vague words such as "quickly", "adequate", "user-friendly", "nice" or "responsive-looking".
- Descriptions must state precisely what is checked.`;

const FREELANCER_AGENT_SYSTEM_PROMPT = `You audit freelance acceptance criteria for deterministic verifiability.

Rules:
- Flag any assertion containing vague terms (quickly, adequate, user-friendly, nice, modern, intuitive).
- Flag any assertion missing a concrete selector, measurable value or explicit URL.
- For every flagged assertion, propose a concrete replacement using only the five allowed assertion types.
- Integer weights must still sum to exactly 100 after revision.
- Set approved to true only when every assertion is deterministic.`;

export interface CompiledContract {
  assertions: AssertionPrimitive[];
  totalBudgetCents: number;
  usedFallback: boolean;
}

/**
 * Generate exactly 5 weighted assertions from a natural-language brief.
 *
 * Falls back to the deterministic demo assertions when the model is
 * unavailable or returns an invalid weight distribution.
 */
export async function compileAssertions(
  projectRequirements: string,
  totalBudgetCents: number,
  traceId: string,
): Promise<CompiledContract> {
  const fnName = `${FILE_NAME}::compileAssertions`;

  try {
    const { object } = await withRetry(
      () =>
        generateObject({
          model: openai('gpt-4o-mini'),
          schema: GeneratedAssertionsSchema,
          system: CLIENT_AGENT_SYSTEM_PROMPT,
          prompt: `Project brief:
${projectRequirements}

Total budget: ${totalBudgetCents} cents.`,
        }),
      { label: 'compileAssertions', maxRetries: 3 },
    );

    if (!validateAssertionWeights(object.assertions)) {
      log('WARN', traceId, fnName, 'Generated weights do not sum to 100, using fallback', {
        weights: object.assertions.map((assertion) => assertion.weight),
      });

      return {
        assertions: DEMO_ASSERTIONS.map((assertion) => ({ ...assertion })),
        totalBudgetCents,
        usedFallback: true,
      };
    }

    return {
      assertions: object.assertions,
      totalBudgetCents,
      usedFallback: false,
    };
  } catch (error) {
    log('WARN', traceId, fnName, 'AI generation failed, using deterministic fallback', {
      reason: error instanceof Error ? error.message : String(error),
    });

    return {
      assertions: DEMO_ASSERTIONS.map((assertion) => ({ ...assertion })),
      totalBudgetCents,
      usedFallback: true,
    };
  }
}

/**
 * Audit assertions for deterministic verifiability and propose revisions.
 *
 * Falls back to a deterministic "approved with no issues" result when the
 * model is unavailable, so the demo flow still reaches authorization.
 */
export async function auditAssertions(
  assertions: AssertionPrimitive[],
  traceId: string,
): Promise<{ result: AuditResult; usedFallback: boolean }> {
  const fnName = `${FILE_NAME}::auditAssertions`;

  try {
    const { object } = await withRetry(
      () =>
        generateObject({
          model: openai('gpt-4o-mini'),
          schema: GeneratedAuditSchema,
          system: FREELANCER_AGENT_SYSTEM_PROMPT,
          prompt: `Audit these assertions:
${JSON.stringify(assertions, null, 2)}`,
        }),
      { label: 'auditAssertions', maxRetries: 3 },
    );

    return { result: object, usedFallback: false };
  } catch (error) {
    log('WARN', traceId, fnName, 'AI audit failed, using deterministic fallback', {
      reason: error instanceof Error ? error.message : String(error),
    });

    return {
      result: { approved: true, issues: [], suggestedRevisions: [] },
      usedFallback: true,
    };
  }
}

/**
 * Apply audit revisions to the assertion list, keeping the 100% weight
 * invariant intact.
 */
export function applyAuditRevisions(
  assertions: AssertionPrimitive[],
  result: AuditResult,
): AssertionPrimitive[] {
  const revised = assertions.map((assertion, index) => {
    const revision = result.suggestedRevisions.find(
      (candidate) => candidate.assertionIndex === index,
    );

    return revision === undefined ? assertion : revision.revisedAssertion;
  });

  return validateAssertionWeights(revised) ? revised : assertions;
}

/**
 * Allocate the budget across the assertions.
 */
export function allocateBudget(
  assertions: AssertionPrimitive[],
  totalBudgetCents: number,
): number[] {
  return allocateCriterionCents(assertions, totalBudgetCents);
}

/**
 * Guard used by the compile route so an invalid AI result never reaches the DB.
 */
export function assertCompileResult(assertions: AssertionPrimitive[]): void {
  if (assertions.length !== ASSERTION_COUNT) {
    throw new AgentToolError(
      'assertCompileResult',
      `Expected exactly ${ASSERTION_COUNT} assertions, received ${assertions.length}`,
      'AI_GENERATION_FAILED',
      { count: assertions.length },
    );
  }

  if (!validateAssertionWeights(assertions)) {
    throw new AgentToolError(
      'assertCompileResult',
      'Assertion weights must sum to exactly 100',
      'WEIGHT_SUM_INVALID',
      {
        weights: assertions.map((assertion) => assertion.weight),
      },
    );
  }
}
