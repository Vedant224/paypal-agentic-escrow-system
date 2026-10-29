# Implementation Plan: PayPal Agentic Escrow System

## Overview

This implementation plan breaks down the PayPal Agentic Escrow System into wave-ordered tasks enforcing strict TypeScript (`noUncheckedIndexedAccess`), custom error classes, integer-cent arithmetic, SSRF/selector sanitization, reusable UI primitives/hooks, and atomic Prisma transactions.

**Git Checkpoint Rule**: At the end of every wave (or major functional milestone), run `npx tsc --noEmit` and execute a Git commit and push to `origin/main` using the designated conventional commit message.

## Tasks

- [x] 0. Wave 0: Security First & Project Initialization
  - [x] 0.1 Create `.gitignore` before `git init`
    - Exclude `.env*` (keep `!.env.example`), `node_modules/`, `.next/`, `*.db*`, `data/`, Playwright artifacts
    - _Requirements: 19.1_
  - [x] 0.2 Initialize Next.js 15 project with TypeScript Strict Mode
    - Create Next.js 15 App Router project
    - Configure `tsconfig.json` with `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitReturns: true`, `noFallthroughCasesInSwitch: true`, `exactOptionalPropertyTypes: true`
    - Configure security headers and PayPal CSP in `next.config.js`
    - Set up enforced folders: `app/`, `components/ui/`, `components/layout/`, `hooks/`, `lib/`, `types/`, `prisma/`
    - _Requirements: 11.1, 19.6_
  - [x] 0.3 Install all required dependencies
    - Install `@paypal/paypal-server-sdk`, `@paypal/react-paypal-js`, `@paypal/agent-toolkit`
    - Install `playwright`, `@playwright/test`, `zod`, `@prisma/client`, `prisma`
    - Install `ai`, `@ai-sdk/openai`, `ag-grid-react`, `ag-grid-community`, `lucide-react`
    - Run `npx playwright install chromium`
    - _Requirements: 3.1, 4.2, 10.1, 12.1_
  - [x] 0.4 Git Checkpoint: Commit and push Wave 0 to `main`
    - Run `npx tsc --noEmit`
    - Commit & push: `chore: security first, next.js 15 app init, and dependencies`

- [x] 1. Wave 1: Core Infrastructure Utilities (`lib/`)
  - [x] 1.1 Create `lib/env.ts` for startup environment variable validation
    - Validate `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, `OPENAI_API_KEY`, `DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, `KERNEL_WS_ENDPOINT`
    - _Requirements: 19.2_
  - [x] 1.2 Create `lib/errors.ts` with custom error classes and `ApiErrorResponse` interface
    - Implement `AppError`, `VerificationEngineError`, `PayPalClientError`, `BrowserConnectorError`, `ParserError`
    - Include `[fileName::functionName]` prefix and machine-readable `ErrorCode`
    - _Requirements: 16.2_
  - [x] 1.3 Create `lib/trace.ts` with trace ID generation and redacted structured logging
    - Implement `createTraceId()`, `redact()`, and `log(level, traceId, source, message, data)`
    - Redact `secret`, `password`, `apiKey`, `authorization`, `token`
    - _Requirements: 19.3, 19.7_
  - [x] 1.4 Create `lib/retry.ts` and `lib/format.ts`
    - Implement `withRetry<T>(fn, { maxRetries, label, backoffMs })` with exponential backoff
    - Implement `formatUSD(cents: number): string` and `formatCentsToPayPalValue(cents: number): string`
    - _Requirements: 5.5, 9.1_
  - [x] 1.5 Create `lib/sanitize.ts` with SSRF blocklist and CSS selector sanitizer
    - Implement `DeploymentUrlSchema` blocking private IPs, `localhost`, and `169.254.169.254` while explicitly permitting internal `/demo/v1-broken` and `/demo/v2-fixed` routes
    - Implement `isSafeSelector(selector)` blocking `javascript:`, `expression()`, `url()`, `eval()`
    - _Requirements: 19.4, 19.5_
  - [x] 1.6 Git Checkpoint: Commit and push Wave 1 to `main`
    - Run `npx tsc --noEmit`
    - Commit & push: `feat(core): startup env validation, custom errors, trace logger, retry, and demo-aware sanitize`

- [x] 2. Wave 2: Single-Source Zod Schemas, Parser & Pretty Printer
  - [x] 2.1 Create `lib/schemas.ts` containing all data models and API request body schemas
    - Define `AssertionPrimitiveSchema` (discriminated union of 5 variants with `SafeSelectorSchema` and `DeploymentUrlSchema`)
    - Define `EscrowContractSchema`, `AuditResultSchema`, and `ContractStatusSchema` (`DRAFT`, `AUTHORIZED`, `PARTIALLY_CAPTURED`, `COMPLETED`, `VOIDED`)
    - Define API request schemas: `CompileContractRequestSchema`, `AuditContractRequestSchema`, `CreateOrderRequestSchema`, `AuthorizeOrderRequestSchema`, `VoidOrderRequestSchema`, `VerifyAndCaptureRequestSchema`
    - Implement `validateAssertionWeights()` and `allocateCriterionCents()`
    - Re-export types in `types/index.ts`
    - _Requirements: 1.2, 1.3, 1.4, 12.1, 14.1, 14.2, 16.1, 16.4_
  - [x] 2.2 Create `lib/parser.ts` and `lib/pretty-printer.ts`
    - Implement `parseAssertionContract(jsonString)` throwing `ParserError` on invalid JSON or schema mismatch
    - Implement `prettyPrintContract(contract)` with 2-space indentation and sorted keys
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_
  - [ ] 2.3 Git Checkpoint: Commit and push Wave 2 to `main`
    - Run `npx tsc --noEmit`
    - Commit & push: `feat(schemas): single-source Zod schemas, parser, and pretty printer`

- [x] 3. Wave 3: Prisma Database Setup & Deterministic Demo Seeder
  - [x] 3.1 Create `prisma/schema.prisma` with integer cents and `VerificationRun` model
    - Define `EscrowContract` with `totalBudgetCents` (`Int`), `verificationInProgress` (`Boolean`), `authorizationExpiresAt` (`DateTime?`)
    - Define `Criterion` with `dollarValueCents` (`Int`) and `assertionIndex` (`Int`)
    - Define `VerificationRun` and `CaptureLedger` (`amountCents` `Int`)
    - Run `npx prisma migrate dev --name init` and create `lib/prisma.ts` singleton
    - _Requirements: 9.1, 9.2, 9.3, 17.1, 17.5_
  - [x] 3.2 Create `lib/demo-seed.ts` for idempotent demo contract seeding
    - Seed the default $100.00 (`10000` cents) contract with the exact 5 assertions matching `/demo/v1-broken` and `/demo/v2-fixed`
    - _Requirements: 7.1, 7.5_
  - [ ] 3.3 Git Checkpoint: Commit and push Wave 3 to `main`
    - Run `npx tsc --noEmit`
    - Commit & push: `feat(db): prisma schema with integer cents, verification run model, and demo seeder`

- [x] 4. Wave 4: PayPal SDK v2 Client, Agent Toolkit & Browser Verification Engine
  - [x] 4.1 Create `lib/paypal-client.ts` using `@paypal/paypal-server-sdk`
    - Initialize `Client`, `OrdersController`, and `PaymentsController` in Sandbox environment
    - Implement `createPayPalAuthorizeOrder`, `authorizePayPalOrder`, `capturePayPalMilestone`, and `voidPayPalAuthorization` wrapped with `withRetry` and `PayPalClientError`
    - _Requirements: 3.1, 3.2, 3.4, 5.5, 5.7_
  - [x] 4.2 Create `lib/agent-tools.ts` integrating `@paypal/agent-toolkit` and custom escrow tools
    - Initialize `@paypal/agent-toolkit` and define `authorizeEscrowOrderTool`, `captureProportionalMilestoneTool`, and `voidEscrowAuthorizationTool`
    - _Requirements: 10.1, 10.2_
  - [x] 4.3 Create `lib/browser-connector.ts` and `lib/verification-engine.ts`
    - Implement `connectBrowser()` supporting `KERNEL_WS_ENDPOINT` CDP with local Chromium fallback
    - Implement `sortCriteriaForExecution()` so `http_status_ok` runs last
    - Implement `executeAssertion()` using `page.request.get()` for `http_status_ok` and `getComputedStyle(el).getPropertyValue()` for `computed_style`
    - Implement `executeAssertionSafe()` with a 10-second per-assertion timeout
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 8.1, 8.2, 8.3_
  - [ ] 4.4 Git Checkpoint: Commit and push Wave 4 to `main`
    - Run `npx tsc --noEmit`
    - Commit & push: `feat(engine): paypal sdk v2 client, agent toolkit, and safe verification engine`

- [x] 5. Wave 5: Backend API Routes (`app/api/`)
  - [x] 5.1 Create `GET /api/contract/[id]/route.ts`
    - Seed default demo contract if `id === "default"` and none exists
    - Return contract, criteria, captureLedger, verificationRuns (descending), and computed `totalCapturedCents`, `remainingAuthorizedCents`, and `passPercentage`
    - _Requirements: 18.1, 18.2, 18.3, 18.4_
  - [x] 5.2 Create `POST /api/contract/compile/route.ts` and `POST /api/contract/audit/route.ts`
    - Validate request bodies with Zod schemas
    - Use Vercel AI SDK `generateObject` with `withRetry` (3 attempts) and fallback to deterministic demo assertions if OpenAI fails
    - Persist contract and criteria in integer cents inside `prisma.$transaction`
    - _Requirements: 1.1, 2.1, 12.4, 12.5, 16.1_
  - [x] 5.3 Create PayPal API routes (`create-order`, `authorize`, `void`)
    - Implement `POST /api/paypal/create-order/route.ts`
    - Implement `POST /api/paypal/authorize/route.ts` storing `paypalAuthorizationId` and `authorizationExpiresAt`
    - Implement `POST /api/paypal/void/route.ts`
    - _Requirements: 3.2, 3.4, 3.5, 5.7, 16.1_
  - [x] 5.4 Create `POST /api/verify-and-capture/route.ts`
    - Enforce atomic `verificationInProgress` lock (return 409 if active) and reset in `finally`
    - Wrap browser context and browser instance in nested `try/finally` blocks
    - Calculate `deltaCaptureCents` from newly passed uncaptured criteria only
    - Execute `capturePayPalMilestone` if `deltaCaptureCents > 0`
    - Persist `Criterion`, `VerificationRun`, `CaptureLedger`, and `EscrowContract` status updates inside `prisma.$transaction`
    - _Requirements: 4.1, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 17.1, 17.2, 17.3, 17.4, 17.5_
  - [x] 5.5 Git Checkpoint: Commit and push Wave 5 to `main`
    - Run `npx tsc --noEmit`
    - Commit & push: `feat(api): contract compile/audit, paypal orders v2, and locked delta verify-and-capture routes`

- [x] 6. Wave 6: Demo Deliverable Routes (`/demo/v1-broken` & `/demo/v2-fixed`)
  - [x] 6.1 Create `app/demo/v1-broken/page.tsx` (Passes 4/5 = 80%)
    - Render `#main-heading`, `.welcome-text` ("task management"), responsive container (`<= 375px`), `.primary-button` with blue background (`rgb(0, 0, 255)` failing expected green `rgb(34, 139, 34)`), and visible pass/fail indicator badges
    - _Requirements: 7.1, 7.3_
  - [x] 6.2 Create `app/demo/v2-fixed/page.tsx` (Passes 5/5 = 100%)
    - Identical to `v1-broken` except `.primary-button` has `backgroundColor: 'rgb(34, 139, 34)'`
    - _Requirements: 7.2, 7.3_
  - [ ] 6.3 Git Checkpoint: Commit and push Wave 6 to `main`
    - Run `npx tsc --noEmit`
    - Commit & push: `feat(demo): demo deliverable routes v1-broken and v2-fixed`

- [ ] 7. Wave 7: Reusable Frontend Client, Hooks & UI Primitives
  - [ ] 7.1 Create `lib/api-client.ts` and custom hooks (`hooks/`)
    - Implement `apiFetch<T>(url, options)` automatically setting `Content-Type: application/json` and throwing `ApiClientError`
    - Implement `hooks/useContract.ts`, `hooks/useVerification.ts`, and `hooks/usePayPal.ts`
    - _Requirements: 16.3_
  - [ ] 7.2 Create reusable UI components (`components/ui/` & `components/layout/`)
    - Implement `Button.tsx`, `Input.tsx`, `Card.tsx`, `Spinner.tsx`, `StatusBadge.tsx`, and `ErrorBoundary.tsx`
    - Implement `DashboardShell.tsx` and `RoleHighlightToggle.tsx`
    - _Requirements: 6.2, 6.5, 13.2_
  - [ ] 7.3 Git Checkpoint: Commit and push Wave 7 to `main`
    - Run `npx tsc --noEmit`
    - Commit & push: `feat(ui-core): reusable api-client, custom hooks, and ui primitives`

- [ ] 8. Wave 8: Feature Panels & Unified Settlement Dashboard
  - [ ] 8.1 Create `SettlementMatrix.tsx`, `CaptureLedger.tsx`, and `AgentTelemetry.tsx`
    - Configure AG Grid columns with `StatusBadge` and formatted USD cent values
    - Render chronological capture ledger and redacted agent telemetry logs
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 10.3_
  - [ ] 8.2 Create `ClientPanel.tsx`, `FreelancerPanel.tsx`, and `app/page.tsx`
    - Wire PayPal `PayPalScriptProvider` (`intent: "authorize"`) and `PayPalButtons`
    - Add 1-click Demo Preset buttons (`Test v1-broken (4/5 -> $80)` and `Test v2-fixed (5/5 -> +$20)`) and copyable Sandbox credentials pill
    - Wrap every major dashboard section in `<ErrorBoundary>`
    - _Requirements: 6.6, 6.7, 7.4, 7.6, 13.1, 13.2_
  - [ ] 8.3 Git Checkpoint: Commit and push Wave 8 to `main`
    - Run `npx tsc --noEmit`
    - Commit & push: `feat(ui): settlement matrix with ag-grid, client/freelancer panels, and unified dashboard`

- [ ] 9. Wave 9: Deployment Config, Documentation & Pre-Flight Verification
  - [ ] 9.1 Create `render.yaml`, `.env.example`, `LICENSE`, and `README.md`
    - Include `NEXT_PUBLIC_PAYPAL_CLIENT_ID` in `render.yaml` and `.env.example`
    - Document 60-second judge testing flow, architecture diagram, and exact 5 demo assertions
    - _Requirements: 11.1, 11.2, 11.3_
  - [ ] 9.2 Run Pre-Flight Checklist
    - Verify `npx tsc --noEmit` and `npm run build` succeed with zero errors
    - Verify end-to-end demo flow: Load default contract → Authorize $100 → Verify `v1-broken` ($80 captured, `finalCapture: false`) → Verify `v2-fixed` ($20 captured, `finalCapture: true`, status `COMPLETED`)
    - _Requirements: All_
  - [ ] 9.3 Final Git Checkpoint: Commit and push release to `main`
    - Run `npx tsc --noEmit`
    - Commit & push: `chore(release): final end-to-end integration verified release`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["0.1", "0.2", "0.3", "0.4"] },
    { "id": 1, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6"] },
    { "id": 2, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 3, "tasks": ["3.1", "3.2", "3.3"] },
    { "id": 4, "tasks": ["4.1", "4.2", "4.3", "4.4"] },
    { "id": 5, "tasks": ["5.1", "5.2", "5.3", "5.4", "5.5"] },
    { "id": 6, "tasks": ["6.1", "6.2", "6.3"] },
    { "id": 7, "tasks": ["7.1", "7.2", "7.3"] },
    { "id": 8, "tasks": ["8.1", "8.2", "8.3"] },
    { "id": 9, "tasks": ["9.1", "9.2", "9.3"] }
  ]
}
```
