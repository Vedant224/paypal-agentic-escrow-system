# PayPal Agentic Escrow — Document Review & Coding Rules

## Part 1: Document Review & Improvements

### ✅ What's Already Strong

| Area | Notes |
|------|-------|
| **Requirements clarity** | Well-structured user stories with SHALL/WHEN/IF acceptance criteria — production-grade |
| **Zod schema design** | Discriminated unions for assertion types is excellent and prevents `eval` |
| **PayPal flow** | Authorize → partial-capture → void lifecycle is correctly modeled |
| **Task dependency graph** | Waves-based execution prevents blocked developers |
| **Demo-first philosophy** | v1-broken / v2-fixed is the smartest decision for hackathon judging |
| **Correctness properties** | Round-trip parsing, weight invariants, delta non-negativity — very solid |

---

### 🔴 Critical Issues (Must Fix)

#### 1. Missing `Content-Type` Header on Every `fetch()` Call
In `design.md`, all client-side `fetch` calls are missing `headers: { 'Content-Type': 'application/json' }`. Without this, `req.json()` on the server will throw.

```typescript
// ❌ Current (will break)
const res = await fetch('/api/paypal/create-order', {
  method: 'POST',
  body: JSON.stringify({ contractId, totalBudget }),
});

// ✅ Fix
const res = await fetch('/api/paypal/create-order', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ contractId, totalBudget }),
});
```

#### 2. `prisma` Not Imported in API Route Code Samples
In `design.md`, multiple route handlers use `prisma` without importing it:
- `/api/paypal/create-order/route.ts` — missing `import { prisma } from '@/lib/prisma'`
- `/api/paypal/authorize/route.ts` — same
- `/api/paypal/void/route.ts` — same

#### 3. Browser Leak on Verification Error
In the verify-and-capture route, if any assertion throws, the `browser.close()` is never reached because there's no `try/finally`. This will leak headless Chrome processes on the server.

```typescript
// ✅ Fix: wrap in try/finally
const browser = await connectBrowser();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  // ... run assertions ...
  await context.close();
} finally {
  await browser.close();
}
```

#### 4. `http_status_ok` Assertion Navigates Away from the Page
The verification engine runs all 5 assertions sequentially on a single page. But `http_status_ok` calls `page.goto(assertion.url)` — this navigates away from the deployment URL. If `http_status_ok` runs before other assertions, subsequent DOM/style checks will fail because you're on the wrong page.

**Fix**: Either:
- Always execute `http_status_ok` last (add ordering logic), OR
- Use a separate `page.request.get(url)` fetch for HTTP checks instead of `page.goto`

> [!CAUTION]
> This is the highest-priority bug. It will cause 100% of verification runs to partially fail if `http_status_ok` is not the last assertion.

#### 5. Missing `ACTIVE` State Transition
The requirements define 5 states: `DRAFT → AUTHORIZED → ACTIVE → COMPLETED | VOIDED`. But the design says `ACTIVE` is an "implicit state, not stored." This means:
- Requirement 5.1 says "THE System SHALL identify newly passed assertions" but there's no gate checking that at least one verification has run
- The `status` check in `verify-and-capture` only allows `AUTHORIZED`, meaning after the first successful run that doesn't complete 100%, subsequent runs will fail the guard

**Fix**: Either add `ACTIVE` to the allowed statuses in verify-and-capture, or update requirements to remove `ACTIVE`.

#### 6. Race Condition: Concurrent Verification Runs
Nothing prevents two verification runs on the same contract simultaneously. Both could:
1. Read `captureId === null` for the same criteria
2. Both call `captureAuthorizedPayment` for the same dollar amount
3. Double-capture the client

**Fix**: Add an optimistic lock (e.g. `verificationInProgress` boolean on contract) or use a database transaction with `SELECT ... FOR UPDATE` equivalent.

---

### 🟡 Important Improvements

#### 7. `error.message` is Untyped
```typescript
// ❌ Current
actualResult: `Error: ${error.message}`,
// ✅ Fix (TypeScript strict mode)
actualResult: `Error: ${error instanceof Error ? error.message : String(error)}`,
```

#### 8. Missing Request Body Validation on API Routes
All API routes blindly destructure `req.json()` without validation. A malformed request will produce a confusing 500 instead of a 400.

**Fix**: Validate every incoming body with a Zod schema:
```typescript
const BodySchema = z.object({
  contractId: z.string().uuid(),
  deploymentUrl: z.string().url(),
});
const body = BodySchema.safeParse(await req.json());
if (!body.success) {
  return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
}
```

#### 9. `verificationRunId` Generated Too Late
In the verify-and-capture route, `verificationRunId` is generated only inside the `if (deltaCaptureAmount > 0)` block. This means runs where nothing new passes have no ID — making the verification history incomplete.

**Fix**: Generate `verificationRunId` at the top of the route and store a VerificationRun record regardless of capture outcome.

#### 10. No API Route to Fetch Contract State
The design references `GET /api/contract/${contractId}` in the optimistic UI code, but no such route is defined in the component hierarchy or tasks.

**Fix**: Add a task for `GET /api/contract/[contractId]/route.ts`.

#### 11. Demo Routes Use Hardcoded Assertion Expectations
The demo pages are tightly coupled to a specific set of 5 assertions. If the LLM generates different selectors/values, the demo won't work.

**Fix**: Pre-seed a deterministic demo contract in the database on first load (don't rely on AI generation for the demo flow). Document the exact 5 assertions in the README.

#### 12. PayPal Authorization Expiry Not Handled
PayPal authorizations expire after 29 days (mentioned in error handling section but never acted upon). The system should check `authorization.expirationTime` and warn the user or auto-void expired authorizations.

#### 13. Missing `VerificationRun` Model
The design tracks `verificationRunId` in `CaptureLedger` but there's no `VerificationRun` model in Prisma. Add one:
```prisma
model VerificationRun {
  id          String   @id @default(uuid())
  contractId  String
  contract    EscrowContract @relation(fields: [contractId], references: [id])
  deploymentUrl String
  runAt       DateTime @default(now())
  passCount   Int
  failCount   Int
  results     String   // JSON array of per-criterion results
}
```

#### 14. Floating-Point Dollar Arithmetic
Using `Float` in Prisma for `dollarValue` and `amount` will eventually cause cent-level rounding errors (e.g., `0.1 + 0.2 !== 0.3`).

**Fix**: Store amounts as integers in cents, divide by 100 only for display.

---

### 🟢 Minor / Nice-to-Have Improvements

| Item | Suggestion |
|------|-----------|
| **AG Grid license** | `ag-grid-community` is MIT but is limited. If you need cell editing or advanced features, note this. |
| **Loading states** | No loading/spinner states defined for PayPal popup, verification, or AI generation. Add `isLoading` booleans. |
| **Environment variable validation** | Add a startup check (e.g., `lib/env.ts`) that validates all required env vars exist on boot, not at first request. |
| **`NEXT_PUBLIC_PAYPAL_CLIENT_ID`** | Listed in env vars section but never referenced in `render.yaml`. Add it. |
| **Accessibility** | Demo routes have no ARIA labels, alt text, or keyboard navigation. Hackathon judges may not care, but it's quick to add. |
| **Error boundary** | No React error boundary in the dashboard. If AG Grid or PayPal buttons crash, the whole page dies. |

---

## Part 2: Software Engineering Rules for the Coding Phase

> [!IMPORTANT]
> Follow ALL rules below during implementation. They are designed to minimize bugs, make errors traceable, and ensure the hackathon demo doesn't crash on stage.

---

### Rule 1: Custom Error Classes with File + Function Context

Every file must define its own error class. Every thrown error must include the file name, function name, and a descriptive message.

```typescript
// lib/verification-engine.ts

class VerificationEngineError extends Error {
  constructor(
    public readonly functionName: string,
    message: string,
    public readonly context?: Record<string, unknown>,
    public readonly cause?: unknown
  ) {
    super(`[verification-engine.ts::${functionName}] ${message}`);
    this.name = 'VerificationEngineError';
  }
}

// Usage:
export async function executeAssertion(page: Page, assertion: AssertionPrimitive) {
  try {
    // ... logic
  } catch (error) {
    throw new VerificationEngineError(
      'executeAssertion',
      `Failed to execute ${assertion.type} assertion`,
      { selector: 'selector' in assertion ? assertion.selector : undefined },
      error // preserves original stack
    );
  }
}
```

**Create these error classes:**
| File | Error Class |
|------|-------------|
| `lib/verification-engine.ts` | `VerificationEngineError` |
| `lib/paypal-client.ts` | `PayPalClientError` |
| `lib/browser-connector.ts` | `BrowserConnectorError` |
| `lib/parser.ts` | `ParserError` |
| `lib/agent-tools.ts` | `AgentToolError` |
| `app/api/*/route.ts` | `ApiRouteError` |

---

### Rule 2: Every API Route Must Follow This Template

```typescript
// app/api/example/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const FILE_NAME = 'api/example/route.ts';

// 1. Define request body schema
const RequestSchema = z.object({
  // ... fields
});

// 2. Define response type
interface SuccessResponse {
  // ... fields
}

export async function POST(req: NextRequest) {
  const fnName = `${FILE_NAME}::POST`;

  // 3. Parse and validate request body
  let body: z.infer<typeof RequestSchema>;
  try {
    const raw = await req.json();
    const parsed = RequestSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten(), source: fnName },
        { status: 400 }
      );
    }
    body = parsed.data;
  } catch {
    return NextResponse.json(
      { error: 'Failed to parse request JSON', source: fnName },
      { status: 400 }
    );
  }

  // 4. Business logic wrapped in try/catch
  try {
    // ... do work ...
    return NextResponse.json(result satisfies SuccessResponse);
  } catch (error) {
    console.error(`[${fnName}] Unhandled error:`, error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        source: fnName,
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
```

---

### Rule 3: Fallback and Graceful Degradation

| Scenario | Primary | Fallback |
|----------|---------|----------|
| Browser connection | `chromium.connectOverCDP(KERNEL_WS_ENDPOINT)` | `chromium.launch({ headless: true })` |
| AI generation | `generateObject()` with schema | Retry 3× → return pre-built default contract for demo |
| PayPal capture | `captureAuthorizedPayment()` | Retry 3× with exponential backoff → log + alert user |
| Database write | `prisma.*.create()` | Retry 3× → write to JSON fallback file → log warning |
| Assertion execution | `executeAssertion()` | `executeAssertionSafe()` wraps in try/catch → mark FAILED with error telemetry |
| Environment variables | `process.env.VAR!` | Validate at startup via `lib/env.ts` → crash fast with clear message |

**Implement a reusable retry utility:**
```typescript
// lib/retry.ts
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; label: string; backoffMs?: number }
): Promise<T> {
  const { maxRetries = 3, label, backoffMs = 1000 } = options;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      console.warn(
        `[retry::${label}] Attempt ${attempt}/${maxRetries} failed:`,
        error instanceof Error ? error.message : error
      );
      if (attempt === maxRetries) throw error;
      await new Promise(r => setTimeout(r, backoffMs * Math.pow(2, attempt - 1)));
    }
  }
  throw new Error(`[retry::${label}] Exhausted all ${maxRetries} retries`);
}
```

---

### Rule 4: Structured Logging with Trace IDs

Every request must generate a `traceId` at entry and propagate it through all function calls.

```typescript
// lib/trace.ts
import { randomUUID } from 'crypto';

export function createTraceId(): string {
  return randomUUID();
}

export function log(
  level: 'INFO' | 'WARN' | 'ERROR',
  traceId: string,
  source: string,
  message: string,
  data?: Record<string, unknown>
) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    traceId,
    source,
    message,
    ...(data && { data }),
  };
  if (level === 'ERROR') {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}
```

---

### Rule 5: TypeScript Strict Mode — No Shortcuts

Add these to `tsconfig.json`:
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

**Rules:**
- **Never use `any`** — use `unknown` and narrow with type guards.
- **Never use `!` (non-null assertion)** unless you've just checked the value one line above. Prefer `?? throwExpression()`.
- **Never use `as` type casts** except for `as const`.
- **Every `switch` must be exhaustive** — add a `default: never` guard.

---

### Rule 6: Database Transaction Safety

Any operation that reads → computes → writes must use a Prisma transaction to prevent race conditions:

```typescript
// ✅ Correct: transaction for verify-and-capture
const result = await prisma.$transaction(async (tx) => {
  const contract = await tx.escrowContract.findUniqueOrThrow({
    where: { id: contractId },
    include: { criteria: true },
  });

  // ... run verifications ...

  // Update all criteria atomically
  for (const criterion of newlyPassed) {
    await tx.criterion.update({
      where: { id: criterion.id },
      data: { status: 'PASSED', captureId, captureTimestamp: new Date() },
    });
  }

  // Create ledger entry
  await tx.captureLedger.create({ data: { ... } });

  return { results, captureId };
});
```

---

### Rule 7: Input Sanitization

- **Never trust client input** — always validate with Zod before using.
- **Sanitize CSS selectors** before passing to Playwright to prevent injection:
  ```typescript
  // lib/sanitize.ts
  export function isSafeSelector(selector: string): boolean {
    // Block javascript: URLs, expressions, and other injection vectors
    const dangerous = /javascript:|expression\(|url\(|eval\(|import\(/i;
    return !dangerous.test(selector);
  }
  ```
- **Sanitize deployment URLs** — only allow `http://` and `https://` protocols.

---

### Rule 8: Resource Cleanup (Always Use `try/finally`)

Any resource that needs cleanup (browser, database connections, file handles) MUST be wrapped in `try/finally`:

```typescript
// ✅ Correct pattern
const browser = await connectBrowser();
try {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    // ... do work ...
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
```

---

### Rule 9: Consistent Error Response Schema

All API error responses must follow this shape:
```typescript
interface ApiErrorResponse {
  error: string;          // Human-readable error message
  source: string;         // File::function that produced the error
  code?: string;          // Machine-readable error code (e.g., 'WEIGHT_SUM_INVALID')
  details?: unknown;      // Zod validation errors, PayPal error body, etc.
  traceId?: string;       // Request trace ID for log correlation
}
```

**Error codes to define:**
| Code | Meaning |
|------|---------|
| `INVALID_REQUEST_BODY` | Zod validation failed on request |
| `CONTRACT_NOT_FOUND` | Contract ID doesn't exist |
| `CONTRACT_NOT_AUTHORIZED` | Contract is not in AUTHORIZED state |
| `WEIGHT_SUM_INVALID` | Assertion weights don't sum to 100 |
| `PAYPAL_ORDER_FAILED` | PayPal order creation failed |
| `PAYPAL_AUTH_FAILED` | PayPal authorization failed |
| `PAYPAL_CAPTURE_FAILED` | PayPal capture failed after retries |
| `PAYPAL_VOID_FAILED` | PayPal void failed |
| `BROWSER_CONNECTION_FAILED` | Couldn't connect to browser |
| `VERIFICATION_TIMEOUT` | Assertion timed out |
| `AI_GENERATION_FAILED` | AI SDK failed after retries |
| `DB_WRITE_FAILED` | Database write failed after retries |

---

### Rule 10: Assertion Execution Order & Isolation

1. **Execute `http_status_ok` LAST** — it navigates away from the page.
2. **Sort assertions before execution**: `dom_exists` → `text_contains` → `computed_style` → `no_horizontal_overflow` → `http_status_ok`.
3. **Set a per-assertion timeout** of 10 seconds to prevent hangs:
   ```typescript
   const result = await Promise.race([
     executeAssertion(page, assertion),
     new Promise<VerificationResult>((_, reject) =>
       setTimeout(() => reject(new Error('Assertion timed out after 10s')), 10_000)
     ),
   ]);
   ```

---

### Rule 11: Environment Variable Validation at Startup

```typescript
// lib/env.ts
import { z } from 'zod';

const EnvSchema = z.object({
  PAYPAL_CLIENT_ID: z.string().min(1, 'PAYPAL_CLIENT_ID is required'),
  PAYPAL_CLIENT_SECRET: z.string().min(1, 'PAYPAL_CLIENT_SECRET is required'),
  OPENAI_API_KEY: z.string().startsWith('sk-', 'OPENAI_API_KEY must start with sk-'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  NEXT_PUBLIC_PAYPAL_CLIENT_ID: z.string().min(1, 'NEXT_PUBLIC_PAYPAL_CLIENT_ID is required'),
  KERNEL_WS_ENDPOINT: z.string().url().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

function validateEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const env = validateEnv();
```

---

### Rule 12: Component Error Boundaries

Every major UI section must be wrapped in a React Error Boundary:

```tsx
// components/ErrorBoundary.tsx
'use client';
import { Component, ReactNode } from 'react';

interface Props {
  fallback: ReactNode;
  componentName: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error(`[ErrorBoundary::${this.props.componentName}]`, error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
```

Wrap in `page.tsx`:
```tsx
<ErrorBoundary componentName="SettlementMatrix" fallback={<p>Grid failed to load</p>}>
  <SettlementMatrix {...props} />
</ErrorBoundary>
```

---

### Rule 13: Git Discipline & Checkpoint Push Workflow

Every functional milestone or task completion MUST trigger a git commit and push to the `main` branch.

| Rule | Details |
|------|---------|
| **Checkpoint frequency** | Create a commit and push to `main` at **every completed task or discrete logical milestone** (e.g. after schema definition, database migration, each API route, verification engine, UI components, hooks). |
| **Commit message format** | Strict Conventional Commits: `feat(scope): message`, `fix(scope): message`, `test(scope): message`, `chore(scope): message`. |
| **Immediate push** | Immediately execute `git push origin main` after verifying the checkpoint passes `npx tsc --noEmit`. |
| **No secrets in commits** | Verify `.gitignore` is active. Never stage `.env.local` or `.db` files. |
| **Atomic checkpoints** | Never batch multiple disparate features into a single massive commit. Small commits make identifying regressions instantaneous. |

#### Checkpoint Execution Matrix:
1. `chore: initialize Next.js 15 app, gitignore, and env template` (Tasks 1, 2, 2.5)
2. `feat(core): setup custom errors, env validation, logging, retry, and api client` (Task 2.6)
3. `feat(schemas): define Zod assertion primitives, contract, criterion, and audit schemas` (Task 3)
4. `feat(db): configure Prisma schema with SQLite, VerificationRun model, and singleton client` (Task 4)
5. `feat(paypal): setup PayPal SDK client and browser connector` (Tasks 5, 6)
6. `feat(verification): implement deterministic Playwright assertion interpreter and execution ordering` (Task 7)
7. `feat(api): implement Orders v2 create-order, authorize, and void routes` (Tasks 8, 9, 10)
8. `feat(api): implement verify-and-capture route with delta capture and concurrency lock` (Task 11)
9. `feat(agent): implement AI contract compilation and freelancer audit routes` (Tasks 12, 13)
10. `test(core): verify core API routes and verification engine tests pass` (Task 14 checkpoint)
11. `feat(ui-core): add StatusBadge, Spinner, ErrorBoundary, format utilities, and custom hooks` (Tasks 14.5, 14.6, 14.7)
12. `feat(ui): implement SettlementMatrix with AG Grid, ClientPanel, FreelancerPanel, and Ledger` (Tasks 15, 16, 17, 18, 19)
13. `feat(demo): build unified dashboard, demo routes v1-broken, v2-fixed, and demo seeder` (Tasks 20, 21, 22, 22.5, 23)
14. `feat(utils): implement contract parser and pretty printer` (Task 24)
15. `chore(deploy): add render.yaml, security headers, CSP, README, and license` (Tasks 25, 26, 27)
16. `chore(release): final end-to-end integration verified release` (Task 28 checkpoint)

---

### Rule 14: Naming Conventions

| Kind | Convention | Example |
|------|-----------|---------|
| Files (components) | PascalCase | `SettlementMatrix.tsx` |
| Files (lib/utils) | kebab-case | `verification-engine.ts` |
| Functions | camelCase | `executeAssertion` |
| Types / Interfaces | PascalCase | `VerificationResult` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| Zod schemas | PascalCase + `Schema` suffix | `EscrowContractSchema` |
| Error classes | PascalCase + `Error` suffix | `VerificationEngineError` |
| API route files | `route.ts` (Next.js convention) | `app/api/paypal/create-order/route.ts` |
| Environment variables | UPPER_SNAKE_CASE | `PAYPAL_CLIENT_ID` |

---

### Rule 15: Structured File System & Reusable Components

Organize the codebase so any developer (or hackathon judge reading the repo) can find anything in under 5 seconds.

#### Folder Structure (enforced)

```
paypal-agentic-escrow/
├── app/                              # Next.js App Router (pages + API routes ONLY)
│   ├── page.tsx                      # Main dashboard — imports from components/
│   ├── layout.tsx                    # Root layout (providers, fonts, metadata)
│   ├── globals.css                   # Global styles
│   ├── demo/
│   │   ├── v1-broken/page.tsx
│   │   └── v2-fixed/page.tsx
│   └── api/
│       ├── contract/
│       │   ├── compile/route.ts
│       │   ├── audit/route.ts
│       │   └── [id]/route.ts         # GET single contract
│       ├── paypal/
│       │   ├── create-order/route.ts
│       │   ├── authorize/route.ts
│       │   └── void/route.ts
│       └── verify-and-capture/route.ts
│
├── components/                       # React components — UI ONLY, no business logic
│   ├── ui/                           # Generic reusable primitives
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Card.tsx
│   │   ├── Badge.tsx
│   │   ├── Spinner.tsx               # Loading spinner (reused everywhere)
│   │   ├── StatusBadge.tsx           # PASS/FAIL/PENDING badge (reused in grid + ledger)
│   │   └── ErrorBoundary.tsx
│   ├── layout/                       # Page-level layout wrappers
│   │   ├── DashboardShell.tsx        # Split-screen container
│   │   └── RoleHighlightToggle.tsx
│   ├── ClientPanel.tsx
│   ├── FreelancerPanel.tsx
│   ├── SettlementMatrix.tsx
│   ├── CaptureLedger.tsx
│   └── AgentTelemetry.tsx
│
├── lib/                              # Business logic, SDKs, utilities — NO React, NO JSX
│   ├── errors.ts                     # All custom error classes
│   ├── env.ts                        # Env var validation (crashes on boot if missing)
│   ├── trace.ts                      # Structured logging with traceId
│   ├── retry.ts                      # Reusable retry utility
│   ├── sanitize.ts                   # Input sanitization (URLs, selectors)
│   ├── paypal-client.ts              # PayPal SDK init + ordersController + paymentsController
│   ├── agent-tools.ts                # PayPal Agent Toolkit + custom tools
│   ├── browser-connector.ts          # Playwright browser connect/launch
│   ├── verification-engine.ts        # Assertion interpreter (switch-based)
│   ├── parser.ts                     # AssertionContract parser
│   ├── pretty-printer.ts             # Deterministic JSON formatter
│   ├── prisma.ts                     # Prisma singleton client
│   └── schemas.ts                    # ALL Zod schemas (single source of truth)
│
├── hooks/                            # Custom React hooks
│   ├── useContract.ts                # Fetch & manage contract state
│   ├── useVerification.ts            # Trigger verification & track results
│   └── usePayPal.ts                  # PayPal button createOrder/onApprove logic
│
├── types/                            # Shared TypeScript types (exported from schemas, but aliases live here)
│   └── index.ts                      # Re-exports from lib/schemas.ts + any UI-only types
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── public/                           # Static assets
│   └── paypal-logo.svg
│
├── .env.local                        # 🔒 NEVER committed (gitignored)
├── .env.example                      # ✅ Committed — placeholder values only
├── .gitignore
├── render.yaml
├── package.json
├── tsconfig.json
└── README.md
```

#### Rules

| Rule | Why |
|------|-----|
| **`app/` has ZERO business logic** | Route files only parse requests, call `lib/` functions, and return responses. If a function has no reference to `NextRequest`/`NextResponse`, it belongs in `lib/`. |
| **`components/` has ZERO data fetching** | Components receive data via props or hooks. No `fetch()` calls inside component files — put those in `hooks/`. |
| **`lib/` has ZERO React imports** | If it imports `react`, it belongs in `components/` or `hooks/`. This keeps `lib/` testable without JSDOM. |
| **One Zod schema file** | All schemas live in `lib/schemas.ts`. No scattered schema definitions across route files. Routes import from `lib/schemas`. |
| **Flat `components/` for features** | Feature components (`ClientPanel`, `SettlementMatrix`) are flat at `components/`. Only generic primitives go in `components/ui/`. |
| **No barrel exports (`index.ts`) in `lib/`** | Barrel files cause circular dependencies. Import directly: `import { env } from '@/lib/env'`. |

#### Reusable Component Rules

| Principle | Implementation |
|-----------|---------------|
| **DRY: Extract on second use** | The first time you write similar code, write it inline. The *second* time, extract it into `components/ui/` or `lib/`. |
| **Status badge** | `StatusBadge.tsx` renders PASS/FAIL/PENDING with color coding. Used in `SettlementMatrix`, `CaptureLedger`, and `FreelancerPanel`. Write it once. |
| **Loading spinner** | `Spinner.tsx` — one component, used in every async button and panel. Never inline a spinner. |
| **Money formatter** | `lib/format.ts` → `formatUSD(cents: number): string` — one function, used everywhere amounts display. Never inline `toFixed(2)`. |
| **Fetch wrapper** | `lib/api-client.ts` → `apiFetch<T>(url, body): Promise<T>` — adds `Content-Type`, error parsing, and loading state. Every component uses this instead of raw `fetch`. |
| **Hook per API route** | Each API route gets a matching hook (`useContract`, `useVerification`, `usePayPal`) that handles loading, error, and data states. Components never manage fetch state directly. |

```typescript
// lib/api-client.ts — Reusable fetch wrapper (used by ALL hooks)
import { ApiErrorResponse } from '@/types';

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorResponse
  ) {
    super(`[api-client::apiFetch] ${body.source}: ${body.error}`);
    this.name = 'ApiClientError';
  }
}

export async function apiFetch<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new ApiClientError(res.status, data as ApiErrorResponse);
  }

  return data as T;
}
```

```typescript
// hooks/useVerification.ts — Reusable hook example
'use client';
import { useState } from 'react';
import { apiFetch } from '@/lib/api-client';

interface VerificationState {
  isLoading: boolean;
  error: string | null;
  results: VerificationResult[] | null;
}

export function useVerification(contractId: string) {
  const [state, setState] = useState<VerificationState>({
    isLoading: false, error: null, results: null,
  });

  const verify = async (deploymentUrl: string) => {
    setState({ isLoading: true, error: null, results: null });
    try {
      const data = await apiFetch<{ results: VerificationResult[] }>(
        '/api/verify-and-capture',
        { contractId, deploymentUrl }
      );
      setState({ isLoading: false, error: null, results: data.results });
    } catch (err) {
      setState({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        results: null,
      });
    }
  };

  return { ...state, verify };
}
```

---

### Rule 16: Security Hardening

#### `.gitignore` (must be created FIRST, before `git init`)

```gitignore
# === Environment & Secrets ===
.env
.env.local
.env.*.local
.env.development
.env.production
*.pem
*.key
*.crt

# === Dependencies ===
node_modules/
.pnp/
.pnp.js

# === Build Output ===
.next/
out/
dist/
build/

# === Database ===
*.db
*.db-journal
prisma/migrations/**/migration_lock.toml
data/

# === IDE & OS ===
.vscode/settings.json
.idea/
*.swp
*.swo
.DS_Store
Thumbs.db
desktop.ini

# === Debug & Logs ===
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# === Playwright ===
test-results/
playwright-report/
blob-report/

# === Misc ===
*.tsbuildinfo
next-env.d.ts
coverage/
```

> [!CAUTION]
> If `.env.local` is committed even once, the secrets are in git history forever. **Create `.gitignore` before the first commit.** If you've already committed secrets, rotate them immediately on the PayPal and OpenAI dashboards.

#### Security Rules Checklist

| Category | Rule | Details |
|----------|------|---------|
| **Secrets** | Never hardcode credentials | All secrets via `process.env` → validated by `lib/env.ts` at startup |
| **Secrets** | `.env.example` has placeholders only | `PAYPAL_CLIENT_ID=sb-xxxxx-placeholder` — never real values |
| **Secrets** | `NEXT_PUBLIC_` prefix carefully | Only `NEXT_PUBLIC_PAYPAL_CLIENT_ID` should be public. Never expose `PAYPAL_CLIENT_SECRET` or `OPENAI_API_KEY` to the browser. |
| **Secrets** | No secrets in error responses | Never include API keys, DB connection strings, or internal paths in `NextResponse.json()` error bodies |
| **Secrets** | No secrets in logs | The `log()` utility must redact any field named `secret`, `password`, `apiKey`, `authorization` |
| **Input** | Validate ALL inputs with Zod | Every API route body, every URL param, every query string — parse with Zod before use |
| **Input** | Sanitize deployment URLs | Only allow `http://` and `https://` — block `javascript:`, `data:`, `file://`, `ftp://` |
| **Input** | Sanitize CSS selectors | Block `expression()`, `url()`, `javascript:` in selectors before passing to Playwright |
| **Input** | Limit request body size | Add `export const config = { api: { bodyParser: { sizeLimit: '1mb' } } }` on API routes |
| **XSS** | No `dangerouslySetInnerHTML` | Never render user-supplied HTML. Use React's built-in escaping. |
| **XSS** | Sanitize `actualResult` telemetry | Telemetry strings are displayed in AG Grid — ensure they can't contain `<script>` |
| **SSRF** | Restrict Playwright navigation | The verification engine navigates to user-supplied URLs. Validate that the URL is not `localhost`, `127.0.0.1`, `0.0.0.0`, `169.254.*` (AWS metadata), or any private IP range. |
| **Deps** | Lock dependency versions | Use `package-lock.json` (committed). Run `npm audit` before submission. |
| **Deps** | No unnecessary deps | Every `package.json` dependency must be justified. Don't install packages "just in case." |
| **Headers** | Security headers in `next.config.js` | Add CORS, CSP, and other security headers (see below) |
| **Auth** | Protect destructive routes | `/api/paypal/void` and `/api/verify-and-capture` should verify that the caller owns the contract |

#### URL Validation for SSRF Prevention (with Demo-Route Whitelist)

```typescript
// lib/sanitize.ts
import { z } from 'zod';

const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '169.254.169.254',  // AWS metadata
  'metadata.google',   // GCP metadata
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

    // Explicitly permit internal /demo/v1-broken and /demo/v2-fixed routes during local/preview testing
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

> [!NOTE]
> **PayPal SDK v2 Initialization Rule**: When initializing `@paypal/paypal-server-sdk`, always use `new Client({ clientCredentialsAuthCredentials: { oAuthClientId, oAuthClientSecret }, environment: Environment.Sandbox })` with `new OrdersController(client)` and `new PaymentsController(client)` rather than legacy `PayPalSDK`.

#### Security Headers in `next.config.js`

```javascript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.paypal.com https://www.sandbox.paypal.com",
              "style-src 'self' 'unsafe-inline'",
              "frame-src https://www.paypal.com https://www.sandbox.paypal.com",
              "connect-src 'self' https://api.openai.com https://api.sandbox.paypal.com",
              "img-src 'self' https://www.paypal.com https://www.sandbox.paypal.com data:",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
```

#### Log Redaction Utility

```typescript
// Add to lib/trace.ts

const SENSITIVE_KEYS = new Set([
  'secret', 'password', 'apiKey', 'api_key', 'authorization',
  'token', 'clientSecret', 'client_secret', 'paypalClientSecret',
]);

export function redact(data: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase().replace(/[-_]/g, ''))) {
      cleaned[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      cleaned[key] = redact(value as Record<string, unknown>);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}
```

---

### Rule 17: Pre-Flight Checklist Before Every PR / Demo

- [ ] `npm run build` succeeds with zero warnings
- [ ] `npx tsc --noEmit` passes (no type errors)
- [ ] All `.env.example` variables are documented
- [ ] No `console.log` in production code (use structured `log()` utility)
- [ ] Browser resources are cleaned up in `finally` blocks
- [ ] All API routes validate request bodies with Zod
- [ ] All error responses include `source` and `code`
- [ ] Demo flow works end-to-end: generate contract → authorize → verify v1-broken (4/5) → verify v2-fixed (5/5 → COMPLETED)
- [ ] `.gitignore` exists and covers `.env*`, `node_modules/`, `.next/`, `*.db`
- [ ] `npm audit` reports zero critical/high vulnerabilities
- [ ] No secrets in code, logs, or error responses (grep for hardcoded keys)
- [ ] Security headers configured in `next.config.js`
- [ ] Deployment URLs validated against SSRF blocklist before Playwright navigation
- [ ] Every reusable utility (`apiFetch`, `formatUSD`, `StatusBadge`, `Spinner`) is imported, not duplicated

---

## Part 3: Summary of Required Doc Changes

### Changes to `requirements.md`
1. Remove `ACTIVE` state from status enum (or add explicit transition rules for it)
2. Add a requirement for request body validation on all API endpoints
3. Add a requirement for concurrent verification prevention (optimistic locking)
4. Add a requirement for a `GET /api/contract/[id]` route to fetch contract state

### Changes to `design.md`
1. Add `Content-Type` headers to all `fetch()` calls
2. Add `import { prisma }` to all route code samples
3. Wrap browser usage in `try/finally` for cleanup
4. Fix `http_status_ok` to not navigate away (use `page.request.get()` or enforce execution order)
5. Add `VerificationRun` Prisma model
6. Replace `Float` with `Int` (cents) for dollar amounts
7. Add `GET /api/contract/[id]/route.ts` to component hierarchy
8. Type `error` correctly in catch blocks (`unknown`, not implicit `any`)

### Changes to `tasks.md`
1. Add task: "Create `lib/errors.ts` with custom error classes"
2. Add task: "Create `lib/retry.ts` with retry utility"
3. Add task: "Create `lib/trace.ts` with structured logging"
4. Add task: "Create `lib/env.ts` with environment validation"
5. Add task: "Create `lib/sanitize.ts` with input sanitization"
6. Add task: "Create `components/ErrorBoundary.tsx`"
7. Add task: "Create `GET /api/contract/[id]/route.ts`"
8. Add task: "Pre-seed demo contract in database"
9. Move task 24 (parser/pretty-printer) earlier — it's a dependency of contract storage
10. Add task 7.7 subtask: "Enforce assertion execution order (http_status_ok last)"
11. Add task: "Create `.gitignore` with full security coverage" (must be Wave 0, before anything else)
12. Add task: "Create `lib/api-client.ts` with reusable `apiFetch` wrapper"
13. Add task: "Create `hooks/useContract.ts`, `hooks/useVerification.ts`, `hooks/usePayPal.ts`"
14. Add task: "Create `components/ui/StatusBadge.tsx`, `Spinner.tsx`, `Button.tsx`"
15. Add task: "Configure security headers in `next.config.js`"
16. Add task: "Create `lib/sanitize.ts` with SSRF blocklist + selector sanitization"
