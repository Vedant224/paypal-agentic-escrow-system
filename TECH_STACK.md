# Tech Stack — PayPal Agentic Escrow

This document explains every technology, library, and design decision used in the PayPal Agentic Escrow system.

---

## 1. Runtime & Framework

| Layer | Technology | Version | Role |
|-------|-----------|---------|------|
| Runtime | Node.js | 22.x | JavaScript runtime |
| Framework | Next.js | 15.5.28 | App Router, API routes, SSR/SSG |
| React | React | 19.2.0 | UI library |
| Language | TypeScript | 5.9.3 | Type-safe JavaScript |
| Styling | Inline styles + CSS variables | — | Dark luxury theme (obsidian/cobalt/sky) |

### TypeScript strictness
`tsconfig.json` enforces:
- `strict: true`
- `noUncheckedIndexedAccess: true`
- `noImplicitReturns: true`
- `noFallthroughCasesInSwitch: true`
- `exactOptionalPropertyTypes: true`
- `forceConsistentCasingInFileNames: true`

No `any`, no `!` (except immediately after a null check), no `as` (except `as const`), exhaustive `switch` with `default: never`.

---

## 2. Payments — PayPal

| Package | Version | Role |
|---------|---------|------|
| `@paypal/paypal-server-sdk` | 2.5.0 | Server-side Orders v2 & Payments v2 (create, authorize, capture, void) |
| `@paypal/react-paypal-js` | 10.6.1 | Client-side PayPal button rendering (`intent: "authorize"`) |
| `@paypal/agent-toolkit` | 1.11.0 | PayPal Agent Toolkit + 47 built-in tools (sandbox mode) |

**Flow:** `createOrder` (`AUTHORIZE` intent) → buyer approves in popup → `authorizeOrder` → store `paypalAuthorizationId` + `authorizationExpiresAt` → partial delta captures via `captureAuthorizedPayment` → `voidPayment` for remaining funds.

All PayPal calls are wrapped in `withRetry` (3 attempts, exponential backoff) and surface `PayPalClientError` with machine-readable error codes (`PAYPAL_ORDER_FAILED`, `PAYPAL_AUTH_FAILED`, `PAYPAL_CAPTURE_FAILED`, `PAYPAL_VOID_FAILED`).

Environment: `Environment.Sandbox` only.

---

## 3. AI Agents — Vercel AI SDK

| Package | Version | Role |
|---------|---------|------|
| `ai` | 5.0.282 | Structured output generation (`generateObject`) |
| `@ai-sdk/openai` | 2.0.138 | OpenAI GPT-4o-mini provider |

**Client_Agent:** Converts natural-language project briefs into exactly 5 weighted assertion primitives (weights sum to 100%) via Zod schema + `generateObject`. Falls back to deterministic demo assertions on failure (3 retries).

**Freelancer_Agent:** Audits assertions for deterministic verifiability, rejects vague terms ("quickly", "adequate", "user-friendly"), proposes concrete revisions. Same retry + fallback pattern.

---

## 4. Verification — Playwright

| Package | Version | Role |
|---------|---------|------|
| `playwright` | 1.64.1 | Headless Chromium browser automation |
| `@playwright/test` | 1.64.1 | Test utilities |

**Verification engine** (`lib/verification-engine.ts`):
- 5 assertion types via exhaustive `switch` (no `eval`, no `new Function`):
  1. `dom_exists` — `page.locator(selector).count() >= 1`
  2. `text_contains` — `innerText().includes(expectedValue)` (case-insensitive)
  3. `computed_style` — `window.getComputedStyle(el).getPropertyValue(prop)`
  4. `no_horizontal_overflow` — `scrollWidth <= innerWidth` at a given viewport
  5. `http_status_ok` — `page.request.get(url)` (non-navigational, runs last)
- Execution order: `dom_exists` → `text_contains` → `computed_style` → `no_horizontal_overflow` → `http_status_ok`
- 10-second per-assertion timeout via `Promise.race`
- `executeAssertionSafe` wraps failures into FAILED results (never aborts a run)
- Nested `try/finally` guarantees `context.close()` and `browser.close()`

**Browser connector** (`lib/browser-connector.ts`):
- Primary: `chromium.connectOverCDP(KERNEL_WS_ENDPOINT)` (Kernel cloud browser)
- Fallback: `chromium.launch({ headless: true })` (local Chromium)

---

## 5. Database — Prisma + SQLite

| Package | Version | Role |
|---------|---------|------|
| `prisma` | 6.19.3 | ORM + CLI |
| `@prisma/client` | 6.19.3 | Database client |

**Models** (all monetary values in integer cents):
- `EscrowContract` — contract header, status, PayPal IDs, `verificationInProgress` lock
- `Criterion` — individual assertion, status (PENDING/PASSED/FAILED), `dollarValueCents`, `captureId`
- `VerificationRun` — every verification execution (pass/fail counts, results JSON)
- `CaptureLedger` — every partial capture (amount, finalCapture flag, verification run link)

**Migrations:** `prisma/migrations/20261028172901_init/`

**Singleton client:** `lib/prisma.ts` caches on `globalThis` to prevent pool exhaustion during Next.js hot reload.

---

## 6. Validation & Schemas

| File | Role |
|------|------|
| `lib/schemas.ts` | Single source of truth — all Zod schemas (assertions, contracts, audits, API request bodies) |
| `lib/sanitize.ts` | SSRF URL blocklist + CSS selector sanitizer |
| `lib/parser.ts` | `parseAssertionContract()` — JSON + schema validation with `ParserError` |
| `lib/pretty-printer.ts` | `prettyPrintContract()` — 2-space indented, recursively sorted keys |

**Key invariants:**
- Assertion weights sum to exactly 100
- Cent allocations sum exactly to `totalBudgetCents` (remainder absorbed by final criterion)
- All monetary values stored as integer cents (no floating-point drift)

---

## 7. Core Utilities (`lib/`)

| File | Role |
|------|------|
| `env.ts` | Startup env validation (crash fast if missing) |
| `errors.ts` | Custom error classes (`AppError`, `VerificationEngineError`, `PayPalClientError`, `BrowserConnectorError`, `ParserError`, `AgentToolError`, `ApiRouteError`, `DatabaseError`, `EnvValidationError`) |
| `trace.ts` | Trace ID generation + redacted structured JSON logging |
| `retry.ts` | `withRetry<T>()` with exponential backoff |
| `format.ts` | `formatUSD(cents)`, `formatCentsToPayPalValue(cents)`, `formatPercentage`, `formatTimestamp` |
| `api-client.ts` | `apiFetch<T>()` / `apiGet<T>()` — adds `Content-Type: application/json`, throws `ApiClientError` |
| `api-response.ts` | Route helpers: `apiError()`, `parseBody()`, `withErrorHandling()` |
| `contract-compiler.ts` | Compile/audit business logic with AI fallback to demo contract |
| `demo-seed.ts` | Idempotent demo contract seeder (5 criteria, $20.00 each) |

**Error codes:** `INVALID_REQUEST_BODY`, `CONTRACT_NOT_FOUND`, `CONTRACT_NOT_AUTHORIZED`, `AUTHORIZATION_EXPIRED`, `VERIFICATION_IN_PROGRESS`, `WEIGHT_SUM_INVALID`, `PAYPAL_ORDER_FAILED`, `PAYPAL_AUTH_FAILED`, `PAYPAL_CAPTURE_FAILED`, `PAYPAL_VOID_FAILED`, `BROWSER_CONNECTION_FAILED`, `VERIFICATION_TIMEOUT`, `UNSAFE_URL_OR_SELECTOR`, `AI_GENERATION_FAILED`, `DB_WRITE_FAILED`, `PARSER_ERROR`, `INTERNAL_ERROR`.

---

## 8. Frontend — UI Components & Hooks

### Components (`components/`)
| Component | Role |
|-----------|------|
| `ClientPanel` | Project scope, budget, compile contract, PayPal authorize/void |
| `FreelancerPanel` | Deployment URL input, verification trigger, demo presets, sandbox credentials |
| `SettlementMatrix` | AG Grid table of all 5 criteria (type, description, target, expected value, weight, dollar value, status badge, telemetry, capture ID) |
| `CaptureLedger` | Chronological list of partial captures |
| `AgentTelemetry` | Redacted log of agent/tool invocations |
| `DashboardShell` | Split-screen shell with role focus toggle |
| `RoleHighlightToggle` | All Roles / Client Focus / Freelancer Focus |

### UI Primitives (`components/ui/`)
| Component | Role |
|-----------|------|
| `Button` | Primary/secondary/destructive/ghost variants, loading state |
| `Spinner` | Single loading spinner (never inline spinners elsewhere) |
| `StatusBadge` | PASSED/FAILED/PENDING/COMPLETED color-coded badges |
| `Card` | Surface panel with title/subtitle/actions |
| `Input` | Labelled text input |
| `ErrorBoundary` | React error boundary per dashboard section |

### Hooks (`hooks/`)
| Hook | Role |
|------|------|
| `useContract` | Fetch/refresh contract state |
| `useVerification` | Trigger verification, track results/loading/error |
| `usePayPal` | Create order, authorize, void |

---

## 9. Security

| Measure | Implementation |
|---------|---------------|
| Secrets | All via `process.env`, validated at startup by `lib/env.ts` |
| `.gitignore` | Excludes `.env*`, `node_modules/`, `.next/`, `*.db*`, `data/`, Playwright artifacts |
| `.env.example` | Placeholders only |
| SSRF | `DeploymentUrlSchema` blocks `localhost`, `127.0.0.1`, `10.*`, `172.16-31.*`, `192.168.*`, `169.254.*`; permits `/demo/*` routes only |
| Selectors | `isSafeSelector()` blocks `javascript:`, `expression()`, `url()`, `eval()`, `import()` |
| XSS | No `dangerouslySetInnerHTML`; telemetry HTML-escaped |
| API validation | Zod on every route body; structured `ApiErrorResponse` |
| Concurrency | `verificationInProgress` optimistic lock (HTTP 409 if busy) |
| Resource cleanup | Nested `try/finally` for browser + context |
| Logs | Sensitive keys (`secret`, `password`, `apiKey`, `authorization`, `token`) redacted |
| Security headers | CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, etc. in `next.config.js` |

---

## 10. Testing

| Tool | Role |
|------|------|
| `vitest` | Unit tests (`tests/core.test.ts`, `tests/verification-engine.test.ts`) |
| Playwright (direct) | E2E dashboard test (`tests/e2e-dashboard.ts`) |

28 unit tests + 18 e2e checks, all passing.

---

## 11. Deployment

| File | Role |
|------|------|
| `render.yaml` | Render.io web service definition with persistent SQLite disk |
| `.env.example` | Committed template with placeholder values |
| `LICENSE` | MIT |

---

## 12. Folder Structure

```
paypal-agentic-escrow/
├── app/                    # Next.js App Router (pages + API routes only)
│   ├── page.tsx            # Unified dashboard
│   ├── layout.tsx          # Root layout
│   ├── globals.css         # Styles + AG Grid theme
│   ├── demo/
│   │   ├── v1-broken/page.tsx
│   │   └── v2-fixed/page.tsx
│   └── api/
│       ├── contract/[id]/route.ts
│       ├── contract/compile/route.ts
│       ├── contract/audit/route.ts
│       ├── paypal/create-order/route.ts
│       ├── paypal/authorize/route.ts
│       ├── paypal/void/route.ts
│       └── verify-and-capture/route.ts
├── components/             # React components (UI only)
│   ├── ui/                 # Button, Spinner, StatusBadge, Card, Input, ErrorBoundary
│   ├── layout/             # DashboardShell, RoleHighlightToggle
│   ├── ClientPanel.tsx
│   ├── FreelancerPanel.tsx
│   ├── SettlementMatrix.tsx
│   ├── CaptureLedger.tsx
│   └── AgentTelemetry.tsx
├── hooks/                  # useContract, useVerification, usePayPal
├── lib/                    # Pure TypeScript (no React)
│   ├── env.ts, errors.ts, trace.ts, retry.ts, format.ts
│   ├── sanitize.ts, api-client.ts, api-response.ts
│   ├── schemas.ts, parser.ts, pretty-printer.ts
│   ├── contract-compiler.ts, demo-seed.ts
│   ├── paypal-client.ts, agent-tools.ts, browser-connector.ts, verification-engine.ts
│   └── prisma.ts
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── public/
│   └── paypal-logo.svg
├── types/
│   └── index.ts
├── tests/
│   ├── core.test.ts
│   ├── verification-engine.test.ts
│   └── e2e-dashboard.ts
├── .env.example
├── .gitignore
├── next.config.js
├── package.json
├── render.yaml
├── tsconfig.json
├── LICENSE
└── README.md
```

---

## 13. Key Design Decisions

1. **Integer cents only** — All money stored as `Int` cents to eliminate `0.1 + 0.2 !== 0.3` floating-point bugs. Conversion to dollars happens only in `format.ts` for display.
2. **No `eval`** — Assertions executed via exhaustive TypeScript `switch` over a Zod discriminated union. Unhandled variants are compile-time errors.
3. **`http_status_ok` never navigates** — Uses `page.request.get(url)` so the DOM stays intact for DOM/style assertions that run before it.
4. **Deterministic demo** — Pre-seeded contract with 5 fixed criteria matching `/demo/v1-broken` and `/demo/v2-fixed` exactly. No dependence on live LLM output for the hackathon demo.
5. **Concurrency lock** — `verificationInProgress` boolean on the contract prevents double-capture from simultaneous verification runs (HTTP 409).
6. **Atomic transactions** — All criteria, VerificationRun, CaptureLedger, and contract status updates inside `prisma.$transaction`.
7. **AI fallback** — If OpenAI fails after 3 retries, the system falls back to the deterministic demo contract so the demo never breaks.