# Technical Design Document

## Overview

The PayPal Agentic Escrow System is a Next.js 15 application that automates freelancer payments through AI-driven contract negotiation, deterministic browser verification, and proportional payment capture. The system uses dual AI agents (`Client_Agent` and `Freelancer_Agent`) to compile and audit machine-verifiable acceptance criteria, Playwright (with Kernel cloud browser support) to execute deterministic assertions against deployed URLs, and PayPal's Orders v2 & Payments v2 APIs (`@paypal/paypal-server-sdk`) with authorization and proportional delta partial-capture flow.

### Key Design Principles

1. **Deterministic Verification**: All acceptance criteria are machine-verifiable through DOM checks, style checks, text matching, viewport overflow checks, or HTTP status validation.
2. **Proportional Delta Payment**: Funds are authorized upfront (`AUTHORIZE` intent) and captured incrementally in integer cents as individual assertions transition to `PASSED`.
3. **Strict Type Safety & Zero Shortcuts**: `strict: true`, `noUncheckedIndexedAccess: true`, no `any`, exhaustive switches (`default: never`), and single-source-of-truth Zod schemas in `lib/schemas.ts`.
4. **Zero Eval & SSRF Hardening**: The verification engine uses a discriminated union switch interpreter, validates selectors, and enforces SSRF checks (while whitelisting internal `/demo/*` routes).
5. **Resource & Concurrency Safety**: Browser instances are always closed in nested `try/finally` blocks; concurrent verifications are blocked via an atomic `verificationInProgress` database lock; database state updates execute inside `prisma.$transaction`.

---

## Architecture

### High-Level System Architecture

```text
┌──────────────────────────────────────────────────────────────────────┐
│                        Next.js 15 App Router                         │
├──────────────────────────────────────────────────────────────────────┤
│  UI Layer (components/ + hooks/ + lib/api-client.ts)                 │
│  ┌────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │  ClientPanel   │  │ FreelancerPanel  │  │  SettlementMatrix    │  │
│  │ (Scope+PayPal) │  │ (URL+Demo Pills) │  │  (AG Grid + Badges)  │  │
│  └───────┬────────┘  └────────┬─────────┘  └──────────┬───────────┘  │
│          │                    │                       │              │
│          ▼                    ▼                       ▼              │
│  API Routes (app/api/*/route.ts — Zod Validated + Trace IDs)         │
│  ┌────────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ /api/contract/*    │  │ /api/paypal/*    │  │ /api/verify-and- │  │
│  │ (compile, audit,   │  │ (create-order,   │  │ capture          │  │
│  │  GET [id])         │  │  authorize, void)│  │ (Lock + Delta)   │  │
│  └─────────┬──────────┘  └────────┬─────────┘  └────────┬─────────┘  │
│            │                      │                     │            │
│            ▼                      ▼                     ▼            │
│  Core Library Layer (lib/ — Pure TypeScript, Custom Error Classes)   │
│  ┌────────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ Vercel AI SDK +    │  │ @paypal/paypal-  │  │ Playwright +     │  │
│  │ @paypal/agent-     │  │ server-sdk v2    │  │ Kernel CDP       │  │
│  │ toolkit            │  │ (Orders/Payments)│  │ Interpreter      │  │
│  └────────────────────┘  └──────────────────┘  └──────────────────┘  │
├──────────────────────────────────────────────────────────────────────┤
│                   Persistence Layer (Prisma + SQLite)                │
│     EscrowContract | Criterion | VerificationRun | CaptureLedger     │
│                      (All currency in Integer Cents)                 │
└──────────────────────────────────────────────────────────────────────┘
```

### Enforced Folder Structure

```text
paypal-agentic-escrow/
├── .gitignore                        # Created FIRST before git init
├── .env.example                      # Placeholder values only
├── LICENSE                           # MIT License
├── README.md
├── next.config.js                    # Security headers & CSP
├── package.json
├── render.yaml                       # Render IaC with NEXT_PUBLIC_PAYPAL_CLIENT_ID
├── tsconfig.json                     # Strict mode enabled
├── prisma/
│   ├── schema.prisma                 # Cents (Int), VerificationRun, verificationInProgress
│   └── seed.ts                       # Deterministic demo contract seeder
├── app/
│   ├── layout.tsx
│   ├── page.tsx                      # Unified Split-Screen Dashboard
│   ├── globals.css
│   ├── demo/
│   │   ├── v1-broken/page.tsx        # Passes 4/5 (80%)
│   │   └── v2-fixed/page.tsx         # Passes 5/5 (100%)
│   └── api/
│       ├── contract/
│       │   ├── compile/route.ts
│       │   ├── audit/route.ts
│       │   └── [id]/route.ts         # GET contract state (or seed default)
│       ├── paypal/
│       │   ├── create-order/route.ts
│       │   ├── authorize/route.ts
│       │   └── void/route.ts
│       └── verify-and-capture/route.ts
├── components/
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Card.tsx
│   │   ├── Spinner.tsx
│   │   ├── StatusBadge.tsx
│   │   └── ErrorBoundary.tsx
│   ├── layout/
│   │   ├── DashboardShell.tsx
│   │   └── RoleHighlightToggle.tsx
│   ├── ClientPanel.tsx
│   ├── FreelancerPanel.tsx
│   ├── SettlementMatrix.tsx
│   ├── CaptureLedger.tsx
│   └── AgentTelemetry.tsx
├── hooks/
│   ├── useContract.ts
│   ├── useVerification.ts
│   └── usePayPal.ts
├── lib/
│   ├── env.ts                        # Zod env validation at startup
│   ├── errors.ts                     # File/function scoped custom Error classes
│   ├── trace.ts                      # Trace ID generator + redacted JSON logger
│   ├── retry.ts                      # Exponential backoff withRetry()
│   ├── sanitize.ts                   # SSRF URL validator + CSS selector sanitizer
│   ├── format.ts                     # formatUSD(cents) helper
│   ├── api-client.ts                 # Reusable apiFetch<T>() with Content-Type
│   ├── schemas.ts                    # ALL Zod schemas (models + API request bodies)
│   ├── parser.ts                     # parseAssertionContract()
│   ├── pretty-printer.ts             # prettyPrintContract() with sorted keys
│   ├── prisma.ts                     # Prisma singleton
│   ├── demo-seed.ts                  # Idempotent demo contract seeder
│   ├── paypal-client.ts              # @paypal/paypal-server-sdk Client & Controllers
│   ├── agent-tools.ts                # @paypal/agent-toolkit + custom v2 escrow tools
│   ├── browser-connector.ts          # Kernel CDP or local Chromium launcher
│   └── verification-engine.ts        # Sorted, timeout-guarded switch interpreter
└── types/
    └── index.ts                      # Re-exports from lib/schemas.ts + UI types
```

---

## Core Foundation Utilities (`lib/`)

### 1. Environment Validation (`lib/env.ts`)

```typescript
import { z } from 'zod';

const EnvSchema = z.object({
  PAYPAL_CLIENT_ID: z.string().min(1, 'PAYPAL_CLIENT_ID is required'),
  PAYPAL_CLIENT_SECRET: z.string().min(1, 'PAYPAL_CLIENT_SECRET is required'),
  NEXT_PUBLIC_PAYPAL_CLIENT_ID: z.string().min(1, 'NEXT_PUBLIC_PAYPAL_CLIENT_ID is required'),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  KERNEL_WS_ENDPOINT: z.string().url().optional().or(z.literal('')),
});

export type Env = z.infer<typeof EnvSchema>;

function validateEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
    throw new Error('[env.ts::validateEnv] Missing required environment variables');
  }
  return parsed.data;
}

export const env = validateEnv();
```

### 2. Custom Error Classes & Consistent API Error Schema (`lib/errors.ts`)

```typescript
export type ErrorCode =
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
  | 'PARSER_ERROR';

export interface ApiErrorResponse {
  error: string;
  source: string;
  code: ErrorCode;
  details?: unknown;
  traceId: string;
}

export class AppError extends Error {
  constructor(
    public readonly fileName: string,
    public readonly functionName: string,
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number = 500,
    public readonly context?: Record<string, unknown>,
    public readonly cause?: unknown
  ) {
    super(`[${fileName}::${functionName}] ${message}`);
    this.name = this.constructor.name;
  }
}

export class VerificationEngineError extends AppError {
  constructor(fn: string, message: string, code: ErrorCode = 'VERIFICATION_TIMEOUT', ctx?: Record<string, unknown>, cause?: unknown) {
    super('verification-engine.ts', fn, code, message, 500, ctx, cause);
  }
}

export class PayPalClientError extends AppError {
  constructor(fn: string, message: string, code: ErrorCode, ctx?: Record<string, unknown>, cause?: unknown) {
    super('paypal-client.ts', fn, code, message, 502, ctx, cause);
  }
}

export class BrowserConnectorError extends AppError {
  constructor(fn: string, message: string, ctx?: Record<string, unknown>, cause?: unknown) {
    super('browser-connector.ts', fn, 'BROWSER_CONNECTION_FAILED', message, 503, ctx, cause);
  }
}

export class ParserError extends AppError {
  constructor(fn: string, message: string, ctx?: Record<string, unknown>, cause?: unknown) {
    super('parser.ts', fn, 'PARSER_ERROR', message, 400, ctx, cause);
  }
}
```

### 3. Input Sanitization & Demo-Aware SSRF Protection (`lib/sanitize.ts`)

```typescript
import { z } from 'zod';

const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '169.254.169.254',
  'metadata.google',
  'metadata.google.internal',
]);

const PRIVATE_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
];

export function isAllowedVerificationUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;

    // Explicitly permit internal /demo/v1-broken and /demo/v2-fixed routes
    const appOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').origin;
    if (
      (parsed.origin === appOrigin || parsed.origin === 'http://localhost:3000') &&
      (parsed.pathname === '/demo/v1-broken' || parsed.pathname === '/demo/v2-fixed')
    ) {
      return true;
    }

    if (BLOCKED_HOSTS.has(parsed.hostname.toLowerCase())) return false;
    if (PRIVATE_IP_RANGES.some((re) => re.test(parsed.hostname))) return false;
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
    'URL must be a public HTTP/HTTPS address or an official /demo/* route'
  );

export function isSafeSelector(selector: string): boolean {
  const dangerous = /javascript:|expression\(|url\(|eval\(|import\(|@import|<script/i;
  return selector.trim().length > 0 && selector.length <= 250 && !dangerous.test(selector);
}
```

---

## Data Models & Single-Source Schemas (`lib/schemas.ts`)

All monetary values in database models and calculations are stored in **integer cents** (`totalBudgetCents`, `dollarValueCents`, `amountCents`) to eliminate floating-point rounding bugs.

```typescript
// lib/schemas.ts
import { z } from 'zod';
import { DeploymentUrlSchema, isSafeSelector } from './sanitize';

const SafeSelectorSchema = z.string().refine(isSafeSelector, 'Unsafe or invalid CSS selector');

export const AssertionPrimitiveSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('dom_exists'),
    description: z.string().min(1),
    selector: SafeSelectorSchema,
    weight: z.number().int().min(5).max(100),
  }),
  z.object({
    type: z.literal('text_contains'),
    description: z.string().min(1),
    selector: SafeSelectorSchema,
    expectedValue: z.string().min(1),
    weight: z.number().int().min(5).max(100),
  }),
  z.object({
    type: z.literal('no_horizontal_overflow'),
    description: z.string().min(1),
    viewportWidth: z.number().int().min(320).max(3840),
    weight: z.number().int().min(5).max(100),
  }),
  z.object({
    type: z.literal('computed_style'),
    description: z.string().min(1),
    selector: SafeSelectorSchema,
    property: z.string().min(1),
    expectedValue: z.string().min(1),
    weight: z.number().int().min(5).max(100),
  }),
  z.object({
    type: z.literal('http_status_ok'),
    description: z.string().min(1),
    url: DeploymentUrlSchema,
    weight: z.number().int().min(5).max(100),
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

export const EscrowContractSchema = z.object({
  id: z.string().uuid(),
  clientId: z.string().min(1),
  freelancerId: z.string().optional(),
  projectRequirements: z.string().min(1),
  assertions: z.array(AssertionPrimitiveSchema).length(5),
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
      assertionIndex: z.number().int().min(0).max(4),
      issue: z.string(),
    })
  ),
  suggestedRevisions: z.array(
    z.object({
      assertionIndex: z.number().int().min(0).max(4),
      revisedAssertion: AssertionPrimitiveSchema,
      rationale: z.string(),
    })
  ),
});

export type AuditResult = z.infer<typeof AuditResultSchema>;

// === API Request Schemas ===
export const CompileContractRequestSchema = z.object({
  projectRequirements: z.string().min(10, 'Provide at least 10 characters of project scope'),
  totalBudgetCents: z.number().int().min(100, 'Minimum budget is $1.00 (100 cents)'),
  clientId: z.string().min(1).default('demo-client-1'),
});

export const AuditContractRequestSchema = z.object({
  contractId: z.string().uuid(),
});

export const CreateOrderRequestSchema = z.object({
  contractId: z.string().uuid(),
});

export const AuthorizeOrderRequestSchema = z.object({
  contractId: z.string().uuid(),
  orderId: z.string().min(1),
});

export const VoidOrderRequestSchema = z.object({
  contractId: z.string().uuid(),
});

export const VerifyAndCaptureRequestSchema = z.object({
  contractId: z.string().uuid(),
  deploymentUrl: DeploymentUrlSchema,
});

export function validateAssertionWeights(assertions: AssertionPrimitive[]): boolean {
  const totalWeight = assertions.reduce((sum, a) => sum + a.weight, 0);
  return totalWeight === 100;
}

export function allocateCriterionCents(
  assertions: AssertionPrimitive[],
  totalBudgetCents: number
): number[] {
  const allocations = assertions.map((a) => Math.round((a.weight * totalBudgetCents) / 100));
  const sum = allocations.reduce((acc, v) => acc + v, 0);
  const diff = totalBudgetCents - sum;
  const lastIdx = allocations.length - 1;
  if (lastIdx >= 0 && allocations[lastIdx] !== undefined) {
    allocations[lastIdx] += diff;
  }
  return allocations;
}
```

---

## Prisma Schema (`prisma/schema.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model EscrowContract {
  id                     String    @id @default(uuid())
  clientId               String
  freelancerId           String?
  projectRequirements    String
  assertionsJson         String    // Pretty-printed JSON array of AssertionPrimitive
  totalBudgetCents       Int       // Stored in integer cents (e.g., 10000 = $100.00)
  currency               String    @default("USD")
  paypalOrderId          String?
  paypalAuthorizationId  String?
  authorizationExpiresAt DateTime?
  status                 String    @default("DRAFT") // DRAFT | AUTHORIZED | PARTIALLY_CAPTURED | COMPLETED | VOIDED
  verificationInProgress Boolean   @default(false)
  createdAt              DateTime  @default(now())
  updatedAt              DateTime  @updatedAt

  criteria               Criterion[]
  captureLedger          CaptureLedger[]
  verificationRuns       VerificationRun[]
}

model Criterion {
  id               String         @id @default(uuid())
  contractId       String
  contract         EscrowContract @relation(fields: [contractId], references: [id], onDelete: Cascade)

  assertionIndex   Int
  assertionJson    String         // JSON-serialized AssertionPrimitive
  status           String         @default("PENDING") // PENDING | PASSED | FAILED
  captureId        String?
  captureTimestamp DateTime?
  actualResult     String?
  dollarValueCents Int            // Integer cents allocated to this criterion

  @@index([contractId])
}

model VerificationRun {
  id            String         @id @default(uuid())
  contractId    String
  contract      EscrowContract @relation(fields: [contractId], references: [id], onDelete: Cascade)
  deploymentUrl String
  runAt         DateTime       @default(now())
  passCount     Int
  failCount     Int
  resultsJson   String         // JSON array of per-criterion verification results

  @@index([contractId])
}

model CaptureLedger {
  id                String         @id @default(uuid())
  contractId        String
  contract          EscrowContract @relation(fields: [contractId], references: [id], onDelete: Cascade)

  captureId         String
  amountCents       Int            // Captured amount in integer cents
  finalCapture      Boolean        @default(false)
  capturedAt        DateTime       @default(now())
  verificationRunId String
  criteriaIdsJson   String         // JSON array of Criterion IDs settled in this capture

  @@index([contractId])
  @@index([verificationRunId])
}
```

---

## PayPal SDK Integration (`lib/paypal-client.ts`)

```typescript
// lib/paypal-client.ts
import {
  Client,
  Environment,
  OrdersController,
  PaymentsController,
} from '@paypal/paypal-server-sdk';
import { env } from './env';
import { formatCentsToPayPalValue } from './format';
import { PayPalClientError } from './errors';
import { withRetry } from './retry';

const paypalClient = new Client({
  clientCredentialsAuthCredentials: {
    oAuthClientId: env.PAYPAL_CLIENT_ID,
    oAuthClientSecret: env.PAYPAL_CLIENT_SECRET,
  },
  timeout: 0,
  environment: Environment.Sandbox,
});

export const ordersController = new OrdersController(paypalClient);
export const paymentsController = new PaymentsController(paypalClient);

export async function createPayPalAuthorizeOrder(contractId: string, totalBudgetCents: number): Promise<string> {
  try {
    const { result } = await withRetry(
      () =>
        ordersController.createOrder({
          body: {
            intent: 'AUTHORIZE',
            purchaseUnits: [
              {
                referenceId: contractId,
                amount: {
                  currencyCode: 'USD',
                  value: formatCentsToPayPalValue(totalBudgetCents),
                },
              },
            ],
          },
          prefer: 'return=representation',
        }),
      { label: 'createPayPalAuthorizeOrder', maxRetries: 3 }
    );

    if (!result.id) {
      throw new Error('Missing order.id in PayPal response');
    }
    return result.id;
  } catch (error) {
    throw new PayPalClientError(
      'createPayPalAuthorizeOrder',
      'Failed to create PayPal order with AUTHORIZE intent',
      'PAYPAL_ORDER_FAILED',
      { contractId, totalBudgetCents },
      error
    );
  }
}

export async function authorizePayPalOrder(orderId: string): Promise<{
  authorizationId: string;
  expirationTime?: string;
}> {
  try {
    const { result } = await withRetry(
      () =>
        ordersController.authorizeOrder({
          id: orderId,
          prefer: 'return=representation',
        }),
      { label: 'authorizePayPalOrder', maxRetries: 3 }
    );

    const authObj = result.purchaseUnits?.[0]?.payments?.authorizations?.[0];
    if (!authObj?.id) {
      throw new Error('Missing authorization ID in PayPal response');
    }

    return {
      authorizationId: authObj.id,
      ...(authObj.expirationTime ? { expirationTime: authObj.expirationTime } : {}),
    };
  } catch (error) {
    throw new PayPalClientError(
      'authorizePayPalOrder',
      'Failed to authorize approved PayPal order',
      'PAYPAL_AUTH_FAILED',
      { orderId },
      error
    );
  }
}

export async function capturePayPalMilestone(params: {
  authorizationId: string;
  amountCents: number;
  isFinalCapture: boolean;
  requestId: string;
}): Promise<string> {
  try {
    const { result } = await withRetry(
      () =>
        paymentsController.captureAuthorizedPayment({
          authorizationId: params.authorizationId,
          paypalRequestId: params.requestId,
          prefer: 'return=representation',
          body: {
            amount: {
              currencyCode: 'USD',
              value: formatCentsToPayPalValue(params.amountCents),
            },
            finalCapture: params.isFinalCapture,
          },
        }),
      { label: 'capturePayPalMilestone', maxRetries: 3 }
    );

    if (!result.id) {
      throw new Error('Missing capture.id in PayPal response');
    }
    return result.id;
  } catch (error) {
    throw new PayPalClientError(
      'capturePayPalMilestone',
      'Failed to execute PayPal partial capture',
      'PAYPAL_CAPTURE_FAILED',
      params,
      error
    );
  }
}

export async function voidPayPalAuthorization(authorizationId: string): Promise<void> {
  try {
    await withRetry(
      () => paymentsController.voidPayment({ authorizationId }),
      { label: 'voidPayPalAuthorization', maxRetries: 3 }
    );
  } catch (error) {
    throw new PayPalClientError(
      'voidPayPalAuthorization',
      'Failed to void PayPal authorization',
      'PAYPAL_VOID_FAILED',
      { authorizationId },
      error
    );
  }
}
```

---

## Verification Engine (`lib/verification-engine.ts`)

### Execution Ordering & Non-Navigational HTTP Check

To guarantee `http_status_ok` never navigates the page away before DOM/style assertions run:

1. Criteria are sorted by priority: `dom_exists` (1) → `text_contains` (2) → `computed_style` (3) → `no_horizontal_overflow` (4) → `http_status_ok` (5).
2. `http_status_ok` uses `page.request.get(assertion.url)` so the active DOM context is never mutated.
3. Every assertion is wrapped in a 10-second `Promise.race` timeout inside `executeAssertionSafe`.

```typescript
// lib/verification-engine.ts
import { Page } from 'playwright';
import { AssertionPrimitive } from './schemas';
import { VerificationEngineError } from './errors';

export interface VerificationResult {
  criterionId: string;
  passed: boolean;
  actualResult: string;
  skipped: boolean;
}

const EXECUTION_ORDER: Record<AssertionPrimitive['type'], number> = {
  dom_exists: 1,
  text_contains: 2,
  computed_style: 3,
  no_horizontal_overflow: 4,
  http_status_ok: 5,
};

export function sortCriteriaForExecution<T extends { assertion: AssertionPrimitive }>(
  items: T[]
): T[] {
  return [...items].sort(
    (a, b) => EXECUTION_ORDER[a.assertion.type] - EXECUTION_ORDER[b.assertion.type]
  );
}

export async function executeAssertion(
  page: Page,
  assertion: AssertionPrimitive
): Promise<{ passed: boolean; actualResult: string }> {
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
        (el, prop) => window.getComputedStyle(el).getPropertyValue(prop),
        assertion.property
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
      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: Math.max(
          document.body.scrollWidth,
          document.documentElement.scrollWidth
        ),
        innerWidth: window.innerWidth,
      }));
      // Restore standard desktop viewport after check
      await page.setViewportSize({ width: 1280, height: 800 });

      const passed = scrollWidth <= innerWidth;
      return {
        passed,
        actualResult: passed
          ? `No overflow at ${assertion.viewportWidth}px (scroll: ${scrollWidth}px <= viewport: ${innerWidth}px)`
          : `Horizontal overflow: scrollWidth ${scrollWidth}px > viewport ${innerWidth}px`,
      };
    }

    case 'http_status_ok': {
      // Non-navigational HTTP check so DOM remains untouched
      const response = await page.request.get(assertion.url);
      const status = response.status();
      const passed = status >= 200 && status <= 299;
      return {
        passed,
        actualResult: `HTTP ${status} (${assertion.url})`,
      };
    }

    default: {
      const _exhaustive: never = assertion;
      throw new VerificationEngineError(
        'executeAssertion',
        `Unhandled assertion variant: ${JSON.stringify(_exhaustive)}`
      );
    }
  }
}

export async function executeAssertionSafe(
  page: Page,
  criterionId: string,
  assertion: AssertionPrimitive
): Promise<VerificationResult> {
  try {
    const outcome = await Promise.race([
      executeAssertion(page, assertion),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new VerificationEngineError(
                'executeAssertionSafe',
                'Assertion timed out after 10s',
                'VERIFICATION_TIMEOUT'
              )
            ),
          10_000
        )
      ),
    ]);

    return {
      criterionId,
      passed: outcome.passed,
      actualResult: outcome.actualResult,
      skipped: false,
    };
  } catch (error) {
    return {
      criterionId,
      passed: false,
      actualResult: `Error: ${error instanceof Error ? error.message : String(error)}`,
      skipped: false,
    };
  }
}
```

---

## API Route: Verify & Proportional Delta Capture (`app/api/verify-and-capture/route.ts`)

Demonstrates:

1. Zod request body validation (`VerifyAndCaptureRequestSchema`)
2. Atomic `verificationInProgress` lock to prevent concurrent runs (HTTP 409)
3. Nested `try/finally` resource cleanup for `browser` and `context`
4. Always recording a `VerificationRun`
5. Integer cent delta math + `prisma.$transaction` atomic persistence

```typescript
// app/api/verify-and-capture/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { VerifyAndCaptureRequestSchema, AssertionPrimitiveSchema } from '@/lib/schemas';
import { connectBrowser } from '@/lib/browser-connector';
import { executeAssertionSafe, sortCriteriaForExecution, VerificationResult } from '@/lib/verification-engine';
import { capturePayPalMilestone } from '@/lib/paypal-client';
import { createTraceId, log } from '@/lib/trace';

const FILE_NAME = 'api/verify-and-capture/route.ts';

export async function POST(req: NextRequest) {
  const traceId = createTraceId();
  const fnName = `${FILE_NAME}::POST`;

  // 1. Parse and validate body
  let body: { contractId: string; deploymentUrl: string };
  try {
    const raw: unknown = await req.json();
    const parsed = VerifyAndCaptureRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid verification request body',
          source: fnName,
          code: 'INVALID_REQUEST_BODY',
          details: parsed.error.flatten(),
          traceId,
        },
        { status: 400 }
      );
    }
    body = parsed.data;
  } catch {
    return NextResponse.json(
      { error: 'Malformed JSON body', source: fnName, code: 'INVALID_REQUEST_BODY', traceId },
      { status: 400 }
    );
  }

  const { contractId, deploymentUrl } = body;

  // 2. Acquire atomic verification lock
  const lockAcquired = await prisma.escrowContract.updateMany({
    where: {
      id: contractId,
      verificationInProgress: false,
    },
    data: {
      verificationInProgress: true,
    },
  });

  if (lockAcquired.count === 0) {
    const existing = await prisma.escrowContract.findUnique({ where: { id: contractId } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Contract not found', source: fnName, code: 'CONTRACT_NOT_FOUND', traceId },
        { status: 404 }
      );
    }
    return NextResponse.json(
      {
        error: 'A verification run is already in progress for this contract',
        source: fnName,
        code: 'VERIFICATION_IN_PROGRESS',
        traceId,
      },
      { status: 409 }
    );
  }

  try {
    const contract = await prisma.escrowContract.findUnique({
      where: { id: contractId },
      include: { criteria: { orderBy: { assertionIndex: 'asc' } }, captureLedger: true },
    });

    if (
      !contract ||
      !contract.paypalAuthorizationId ||
      (contract.status !== 'AUTHORIZED' && contract.status !== 'PARTIALLY_CAPTURED')
    ) {
      return NextResponse.json(
        {
          error: `Contract status is "${contract?.status ?? 'UNKNOWN'}". Must be AUTHORIZED or PARTIALLY_CAPTURED.`,
          source: fnName,
          code: 'CONTRACT_NOT_AUTHORIZED',
          traceId,
        },
        { status: 400 }
      );
    }

    if (contract.authorizationExpiresAt && contract.authorizationExpiresAt.getTime() < Date.now()) {
      return NextResponse.json(
        {
          error: 'PayPal authorization has expired (29-day limit exceeded)',
          source: fnName,
          code: 'AUTHORIZATION_EXPIRED',
          traceId,
        },
        { status: 400 }
      );
    }

    // 3. Execute browser assertions with guaranteed cleanup
    const resultsById = new Map<string, VerificationResult>();
    const newlyPassedIds: string[] = [];

    const browser = await connectBrowser();
    try {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      try {
        const page = await context.newPage();
        await page.goto(deploymentUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });

        const parsedCriteria = contract.criteria.map((c) => ({
          criterion: c,
          assertion: AssertionPrimitiveSchema.parse(JSON.parse(c.assertionJson)),
        }));

        const sorted = sortCriteriaForExecution(parsedCriteria);

        for (const { criterion, assertion } of sorted) {
          if (criterion.status === 'PASSED' && criterion.captureId) {
            resultsById.set(criterion.id, {
              criterionId: criterion.id,
              passed: true,
              actualResult: criterion.actualResult ?? 'Previously verified & settled',
              skipped: true,
            });
            continue;
          }

          const res = await executeAssertionSafe(page, criterion.id, assertion);
          resultsById.set(criterion.id, res);
          if (res.passed) {
            newlyPassedIds.push(criterion.id);
          }
        }
      } finally {
        await context.close();
      }
    } finally {
      await browser.close();
    }

    // Order results back by original assertionIndex
    const orderedResults: VerificationResult[] = contract.criteria.map(
      (c) =>
        resultsById.get(c.id) ?? {
          criterionId: c.id,
          passed: false,
          actualResult: 'Not evaluated',
          skipped: false,
        }
    );

    const newlyPassedCriteria = contract.criteria.filter((c) => newlyPassedIds.includes(c.id));
    const deltaCaptureCents = newlyPassedCriteria.reduce((sum, c) => sum + c.dollarValueCents, 0);
    const totalCapturedSoFarCents = contract.captureLedger.reduce((sum, l) => sum + l.amountCents, 0);
    const isFinalCapture = totalCapturedSoFarCents + deltaCaptureCents >= contract.totalBudgetCents;

    const verificationRunId = randomUUID();
    let captureId: string | undefined;

    if (deltaCaptureCents > 0) {
      captureId = await capturePayPalMilestone({
        authorizationId: contract.paypalAuthorizationId,
        amountCents: deltaCaptureCents,
        isFinalCapture,
        requestId: verificationRunId,
      });
    }

    const passCount = orderedResults.filter((r) => r.passed).length;
    const failCount = orderedResults.length - passCount;

    // 4. Atomic DB transaction for criteria, VerificationRun, CaptureLedger, and Contract status
    await prisma.$transaction(async (tx) => {
      for (const res of orderedResults) {
        if (res.skipped) continue;
        const isNewlySettled = res.passed && Boolean(captureId);
        await tx.criterion.update({
          where: { id: res.criterionId },
          data: {
            status: res.passed ? 'PASSED' : 'FAILED',
            actualResult: res.actualResult,
            ...(isNewlySettled
              ? { captureId: captureId ?? null, captureTimestamp: new Date() }
              : {}),
          },
        });
      }

      await tx.verificationRun.create({
        data: {
          id: verificationRunId,
          contractId,
          deploymentUrl,
          passCount,
          failCount,
          resultsJson: JSON.stringify(orderedResults),
        },
      });

      if (deltaCaptureCents > 0 && captureId) {
        await tx.captureLedger.create({
          data: {
            contractId,
            captureId,
            amountCents: deltaCaptureCents,
            finalCapture: isFinalCapture,
            verificationRunId,
            criteriaIdsJson: JSON.stringify(newlyPassedIds),
          },
        });

        await tx.escrowContract.update({
          where: { id: contractId },
          data: {
            status: isFinalCapture ? 'COMPLETED' : 'PARTIALLY_CAPTURED',
          },
        });
      }
    });

    log('INFO', traceId, fnName, 'Verification run completed', {
      contractId,
      verificationRunId,
      passCount,
      deltaCaptureCents,
      captureId,
    });

    return NextResponse.json({
      verificationRunId,
      results: orderedResults,
      deltaCaptureCents,
      captureId: captureId ?? null,
      status: isFinalCapture
        ? 'COMPLETED'
        : deltaCaptureCents > 0
          ? 'PARTIALLY_CAPTURED'
          : contract.status,
    });
  } catch (error) {
    log('ERROR', traceId, fnName, 'Verification & capture failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Verification failed',
        source: fnName,
        code: 'PAYPAL_CAPTURE_FAILED',
        traceId,
      },
      { status: 500 }
    );
  } finally {
    // Always release the lock
    await prisma.escrowContract.updateMany({
      where: { id: contractId },
      data: { verificationInProgress: false },
    });
  }
}
```

---

## Deterministic Pre-Seeded Demo Contract (`lib/demo-seed.ts`)

So that `/demo/v1-broken` (4/5 pass = $80.00) and `/demo/v2-fixed` (5/5 pass = $20.00 remaining) work 100% deterministically on first page load without relying on random LLM selectors, `GET /api/contract/[id]` automatically seeds this contract when `id === "default"` and no contract exists:

| # | Type | Target | Expected | Weight | Value (Cents) | `v1-broken` | `v2-fixed` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `dom_exists` | `#main-heading` | `>= 1 element` | `20%` | `2000` ($20) | **PASS** | **PASS** |
| 2 | `text_contains` | `.welcome-text` | `"task management"` | `20%` | `2000` ($20) | **PASS** | **PASS** |
| 3 | `no_horizontal_overflow` | `viewportWidth: 375` | `scrollWidth <= 375` | `20%` | `2000` ($20) | **PASS** | **PASS** |
| 4 | `computed_style` | `.primary-button` (`background-color`) | `"rgb(34, 139, 34)"` | `20%` | `2000` ($20) | **FAIL** (`rgb(0, 0, 255)`) | **PASS** |
| 5 | `http_status_ok` | `${NEXT_PUBLIC_APP_URL}/demo/v1-broken` | `HTTP 200-299` | `20%` | `2000` ($20) | **PASS** | **PASS** |
