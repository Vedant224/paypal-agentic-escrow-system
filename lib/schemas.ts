/**
 * lib/schemas.ts
 * -----------------------------------------------------------------------------
 * The single source of truth for every Zod schema in the application: assertion
 * primitives, escrow contracts, audit results and all API request bodies.
 * Nothing outside this file may define a schema.
 * -----------------------------------------------------------------------------
 */
import { z } from 'zod';
import { DeploymentUrlSchema, SafeSelectorSchema } from './sanitize';

const WEIGHT_MIN = 5;
const WEIGHT_MAX = 100;
const ASSERTION_COUNT = 5;

export const AssertionTypeSchema = z.enum([
  'dom_exists',
  'text_contains',
  'no_horizontal_overflow',
  'computed_style',
  'http_status_ok',
]);

export type AssertionType = z.infer<typeof AssertionTypeSchema>;

const WeightSchema = z.number().int().min(WEIGHT_MIN).max(WEIGHT_MAX);

/**
 * Discriminated union of the five deterministic assertion primitives. The
 * `type` field is the discriminator, so the verification engine can switch on it
 * exhaustively without any casting.
 */
export const AssertionPrimitiveSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('dom_exists'),
    description: z.string().min(1),
    selector: SafeSelectorSchema,
    weight: WeightSchema,
  }),
  z.object({
    type: z.literal('text_contains'),
    description: z.string().min(1),
    selector: SafeSelectorSchema,
    expectedValue: z.string().min(1),
    weight: WeightSchema,
  }),
  z.object({
    type: z.literal('no_horizontal_overflow'),
    description: z.string().min(1),
    viewportWidth: z.number().int().min(320).max(3840),
    weight: WeightSchema,
  }),
  z.object({
    type: z.literal('computed_style'),
    description: z.string().min(1),
    selector: SafeSelectorSchema,
    property: z.string().min(1).max(100),
    expectedValue: z.string().min(1),
    weight: WeightSchema,
  }),
  z.object({
    type: z.literal('http_status_ok'),
    description: z.string().min(1),
    url: DeploymentUrlSchema,
    weight: WeightSchema,
  }),
]);

export type AssertionPrimitive = z.infer<typeof AssertionPrimitiveSchema>;

export const ContractStatusSchema = z.enum([
  'DRAFT',
  'AUTHORIZED',
  'PARTIALLY_CAPTURED',
  'COMPLETED',
  'VOIDED',
]);

export type ContractStatus = z.infer<typeof ContractStatusSchema>;

export const CriterionStatusSchema = z.enum(['PENDING', 'PASSED', 'FAILED']);

export type CriterionStatus = z.infer<typeof CriterionStatusSchema>;

export const EscrowContractSchema = z.object({
  id: z.string().uuid(),
  clientId: z.string().min(1),
  freelancerId: z.string().optional(),
  projectRequirements: z.string().min(1),
  assertions: z.array(AssertionPrimitiveSchema).length(ASSERTION_COUNT),
  totalBudgetCents: z.number().int().positive(),
  currency: z.literal('USD'),
  paypalOrderId: z.string().optional(),
  paypalAuthorizationId: z.string().optional(),
  authorizationExpiresAt: z.string().datetime().optional(),
  status: ContractStatusSchema,
  verificationInProgress: z.boolean().default(false),
});

export type EscrowContract = z.infer<typeof EscrowContractSchema>;

export const AuditResultSchema = z.object({
  approved: z.boolean(),
  issues: z.array(
    z.object({
      assertionIndex: z.number().int().min(0).max(ASSERTION_COUNT - 1),
      issue: z.string(),
    }),
  ),
  suggestedRevisions: z.array(
    z.object({
      assertionIndex: z.number().int().min(0).max(ASSERTION_COUNT - 1),
      revisedAssertion: AssertionPrimitiveSchema,
      rationale: z.string(),
    }),
  ),
});

export type AuditResult = z.infer<typeof AuditResultSchema>;

export const VerificationResultSchema = z.object({
  criterionId: z.string(),
  passed: z.boolean(),
  actualResult: z.string(),
  skipped: z.boolean(),
});

export type VerificationResult = z.infer<typeof VerificationResultSchema>;

// ---------------------------------------------------------------------------
// API Request Schemas
// ---------------------------------------------------------------------------

export const CompileContractRequestSchema = z.object({
  projectRequirements: z
    .string()
    .min(10, 'Provide at least 10 characters of project scope')
    .max(4000, 'Project scope must be 4000 characters or fewer'),
  totalBudgetCents: z
    .number()
    .int()
    .min(100, 'Minimum budget is $1.00 (100 cents)')
    .max(100_000_000, 'Maximum budget is $1,000,000.00'),
  clientId: z.string().min(1).max(120).default('demo-client-1'),
});

export type CompileContractRequest = z.infer<typeof CompileContractRequestSchema>;

export const AuditContractRequestSchema = z.object({
  contractId: z.string().uuid(),
});

export type AuditContractRequest = z.infer<typeof AuditContractRequestSchema>;

export const CreateOrderRequestSchema = z.object({
  contractId: z.string().uuid(),
});

export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;

export const AuthorizeOrderRequestSchema = z.object({
  contractId: z.string().uuid(),
  orderId: z.string().min(1),
});

export type AuthorizeOrderRequest = z.infer<typeof AuthorizeOrderRequestSchema>;

export const VoidOrderRequestSchema = z.object({
  contractId: z.string().uuid(),
});

export type VoidOrderRequest = z.infer<typeof VoidOrderRequestSchema>;

export const VerifyAndCaptureRequestSchema = z.object({
  contractId: z.string().uuid(),
  deploymentUrl: DeploymentUrlSchema,
});

export type VerifyAndCaptureRequest = z.infer<typeof VerifyAndCaptureRequestSchema>;

// ---------------------------------------------------------------------------
// Domain helpers
// ---------------------------------------------------------------------------

/**
 * The integer weights of every assertion must sum to exactly 100.
 */
export function validateAssertionWeights(assertions: AssertionPrimitive[]): boolean {
  const totalWeight = assertions.reduce((sum, assertion) => sum + assertion.weight, 0);
  return totalWeight === 100;
}

/**
 * Allocate the total budget in integer cents across assertions proportionally to
 * their weights. The final assertion absorbs any rounding remainder so the
 * allocations always sum to `totalBudgetCents` exactly.
 */
export function allocateCriterionCents(
  assertions: AssertionPrimitive[],
  totalBudgetCents: number,
): number[] {
  const allocations = assertions.map((assertion) =>
    Math.round((assertion.weight * totalBudgetCents) / 100),
  );

  const allocated = allocations.reduce((acc, value) => acc + value, 0);
  const remainder = totalBudgetCents - allocated;
  const lastIndex = allocations.length - 1;

  const lastAllocation = allocations[lastIndex];
  if (lastIndex >= 0 && lastAllocation !== undefined) {
    allocations[lastIndex] = lastAllocation + remainder;
  }

  return allocations;
}
