/**
 * types/index.ts
 * -----------------------------------------------------------------------------
 * Re-exports the canonical types from `lib/schemas.ts` plus a small number of
 * UI-only types. Components and hooks import from here so there is exactly one
 * type vocabulary across the app.
 * -----------------------------------------------------------------------------
 */
export type {
  AssertionPrimitive,
  AssertionType,
  AuditResult,
  CompileContractRequest,
  ContractStatus,
  CriterionStatus,
  EscrowContract,
  VerificationResult,
} from '@/lib/schemas';

export { ContractStatusSchema, CriterionStatusSchema } from '@/lib/schemas';

export type ApiErrorCode =
  | 'INVALID_REQUEST_BODY'
  | 'CONTRACT_NOT_FOUND'
  | 'CONTRACT_NOT_AUTHORIZED'
  | 'AUTHORIZATION_EXPIRED'
  | 'VERIFICATION_IN_PROGRESS'
  | 'WEIGHT_SUM_INVALID'
  | 'PAYPAL_ORDER_FAILED'
  | 'PAYPAL_AUTH_FAILED'
  | 'PAYPAL_CAPTURE_FAILED'
  | 'PAYPAL_VOID_FAILED'
  | 'BROWSER_CONNECTION_FAILED'
  | 'VERIFICATION_TIMEOUT'
  | 'UNSAFE_URL_OR_SELECTOR'
  | 'AI_GENERATION_FAILED'
  | 'DB_WRITE_FAILED'
  | 'PARSER_ERROR'
  | 'INTERNAL_ERROR';

export interface ApiErrorResponse {
  error: string;
  source: string;
  code: ApiErrorCode;
  details?: unknown;
  traceId?: string;
}

/** Role focus modes offered by the dashboard toggle. */
export type RoleFocus = 'all' | 'client' | 'freelancer';

/** A criterion as rendered in the settlement matrix. */
export interface CriterionView {
  id: string;
  assertionIndex: number;
  assertionType: string;
  description: string;
  target: string;
  expectedValue: string;
  weight: number;
  dollarValueCents: number;
  status: 'PENDING' | 'PASSED' | 'FAILED';
  actualResult: string | null;
  captureId: string | null;
  captureTimestamp: string | null;
}

/** A ledger entry as rendered in the capture ledger panel. */
export interface CaptureLedgerView {
  id: string;
  captureId: string;
  amountCents: number;
  finalCapture: boolean;
  capturedAt: string;
  verificationRunId: string;
}

/** A verification run as returned by the contract endpoint. */
export interface VerificationRunView {
  id: string;
  deploymentUrl: string;
  runAt: string;
  passCount: number;
  failCount: number;
}

/** Full contract payload returned by `GET /api/contract/[id]`. */
export interface ContractState {
  contract: {
    id: string;
    clientId: string;
    projectRequirements: string;
    totalBudgetCents: number;
    currency: string;
    paypalOrderId: string | null;
    paypalAuthorizationId: string | null;
    authorizationExpiresAt: string | null;
    status: string;
    verificationInProgress: boolean;
  };
  criteria: CriterionView[];
  captureLedger: CaptureLedgerView[];
  verificationRuns: VerificationRunView[];
  totalCapturedCents: number;
  remainingAuthorizedCents: number;
  passPercentage: number;
}

/** A redacted agent/tool invocation record shown in the telemetry panel. */
export interface TelemetryEntry {
  id: string;
  timestamp: string;
  source: string;
  tool: string;
  summary: string;
  level: 'INFO' | 'WARN' | 'ERROR';
}
