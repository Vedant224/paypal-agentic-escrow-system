/**
 * lib/parser.ts
 * -----------------------------------------------------------------------------
 * Deterministic parsing of assertion contracts. Every failure surfaces as a
 * `ParserError` carrying the offending field details, so a malformed contract
 * can never reach the verification engine.
 * -----------------------------------------------------------------------------
 */
import { z } from 'zod';
import { ParserError } from './errors';
import {
  AssertionPrimitiveSchema,
  AuditResultSchema,
  EscrowContractSchema,
  allocateCriterionCents,
  validateAssertionWeights,
} from './schemas';
import type { AssertionPrimitive, AuditResult, EscrowContract } from './schemas';

const FILE_NAME = 'parser.ts';

/**
 * Parse + validate a JSON string against an arbitrary schema.
 *
 * The schema generic is preserved (`z.output<S>`) so Zod's output types — for
 * example a field with `.default()` becoming required — survive the helper
 * boundary instead of being widened back to the input type.
 */
function parseWithSchema<S extends z.ZodTypeAny>(
  fnName: string,
  jsonString: string,
  schema: S,
): z.output<S> {
  let raw: unknown;

  try {
    raw = JSON.parse(jsonString);
  } catch (error) {
    throw new ParserError(
      fnName,
      'Contract is not valid JSON',
      { received: jsonString.slice(0, 200) },
      error,
    );
  }

  const parsed = schema.safeParse(raw);

  if (!parsed.success) {
    throw new ParserError(
      fnName,
      'Contract does not match the expected schema',
      { issues: parsed.error.issues },
      parsed.error,
    );
  }

  return parsed.data;
}

/**
 * Parse a JSON string into a validated escrow contract.
 */
export function parseAssertionContract(jsonString: string): EscrowContract {
  const fnName = `${FILE_NAME}::parseAssertionContract`;

  if (typeof jsonString !== 'string' || jsonString.trim().length === 0) {
    throw new ParserError(fnName, 'Contract string must not be empty');
  }

  return parseWithSchema(fnName, jsonString, EscrowContractSchema);
}

/**
 * Parse a JSON string into a validated list of assertion primitives.
 */
export function parseAssertionList(jsonString: string): AssertionPrimitive[] {
  const fnName = `${FILE_NAME}::parseAssertionList`;

  if (typeof jsonString !== 'string' || jsonString.trim().length === 0) {
    throw new ParserError(fnName, 'Assertion list string must not be empty');
  }

  let raw: unknown;

  try {
    raw = JSON.parse(jsonString);
  } catch (error) {
    throw new ParserError(
      fnName,
      'Assertion list is not valid JSON',
      { received: jsonString.slice(0, 200) },
      error,
    );
  }

  const parsed = z.array(AssertionPrimitiveSchema).safeParse(raw);

  if (!parsed.success) {
    throw new ParserError(
      fnName,
      'Assertion list does not match the expected schema',
      { issues: parsed.error.issues },
      parsed.error,
    );
  }

  return parsed.data;
}

/**
 * Parse a JSON string into a validated audit result.
 */
export function parseAuditResult(jsonString: string): AuditResult {
  const fnName = `${FILE_NAME}::parseAuditResult`;
  return parseWithSchema(fnName, jsonString, AuditResultSchema);
}

/**
 * Validate that the weights sum to 100 and that the cent allocation is exact.
 * Throws `ParserError` when either invariant is violated.
 */
export function assertContractIntegrity(
  fnName: string,
  assertions: AssertionPrimitive[],
  totalBudgetCents: number,
): number[] {
  if (!validateAssertionWeights(assertions)) {
    const totalWeight = assertions.reduce((sum, assertion) => sum + assertion.weight, 0);
    throw new ParserError(
      fnName,
      'Assertion weights must sum to exactly 100',
      { totalWeight, expected: 100 },
    );
  }

  const allocations = allocateCriterionCents(assertions, totalBudgetCents);
  const allocatedTotal = allocations.reduce((acc, value) => acc + value, 0);

  if (allocatedTotal !== totalBudgetCents) {
    throw new ParserError(
      fnName,
      'Cent allocation does not equal the total budget',
      { allocatedTotal, totalBudgetCents },
    );
  }

  return allocations;
}
