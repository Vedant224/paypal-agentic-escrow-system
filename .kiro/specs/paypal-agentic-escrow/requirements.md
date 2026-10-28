# Requirements Document

## Introduction

The PayPal Agentic Escrow System is a freelancer payment platform that enables clients to pay only for work that passes automated verification checks. The system uses dual AI agents for contract negotiation, deterministic browser verification for quality assurance, and PayPal's Orders v2 & Payments v2 APIs with authorization and proportional delta partial-capture flow. This eliminates payment disputes by making acceptance criteria concrete, measurable, and automatically verifiable.

## Glossary

- **System**: The PayPal Agentic Escrow web application
- **Client_Agent**: AI agent that converts natural language project requirements into weighted JSON assertions
- **Freelancer_Agent**: AI agent that audits assertions for determinism and converts vague rules into concrete checks
- **Verification_Engine**: Headless browser automation component that executes deterministic assertions
- **Settlement_Dashboard**: Interactive UI displaying assertion status, weights, and payment captures
- **Authorization**: PayPal order state where funds are held but not captured
- **Partial_Capture**: PayPal operation that captures a portion of authorized funds based on verification results
- **Assertion**: A single verifiable check with a weight percentage and integer cent value
- **Contract**: Collection of 5 weighted assertions that sum to 100% of project budget
- **DOM**: Document Object Model representing the HTML structure of a web page
- **Computed_Style**: CSS property value as rendered by the browser
- **Viewport**: The visible area of a web page in the browser
- **PayPal_Orders_Controller**: PayPal SDK v2 controller (`OrdersController`) for creating and authorizing orders
- **PayPal_Payments_Controller**: PayPal SDK v2 controller (`PaymentsController`) for capturing and voiding authorized payments
- **Structured_Output**: AI-generated response conforming to a Zod schema
- **Kernel_API**: Cloud browser service for deterministic verification
- **AG_Grid**: Interactive data grid component for displaying assertion contracts
- **Demo_Route**: Pre-built application routes (`/demo/v1-broken` and `/demo/v2-fixed`) for demonstrating verification pass/fail scenarios

## Requirements

### Requirement 1: Client Agent Contract Generation

**User Story:** As a client, I want to describe my project in natural language, so that the system generates measurable acceptance criteria automatically.

#### Acceptance Criteria

1. WHEN a client submits project requirements in natural language, THE Client_Agent SHALL generate exactly 5 assertions using the Vercel AI SDK with structured outputs
2. THE Client_Agent SHALL assign integer weight percentages to each assertion that sum to exactly 100%
3. THE System SHALL calculate integer cent values (`dollarValueCents`) for each assertion based on the total project budget in cents (`totalBudgetCents`) and assigned weights
4. THE Client_Agent SHALL use a Zod discriminated union schema to enforce assertion structure containing type, description, selector/url/viewportWidth, expectedValue, and weight fields
5. WHEN generating assertions, THE Client_Agent SHALL exclusively use `dom_exists`, `text_contains`, `no_horizontal_overflow`, `computed_style`, and `http_status_ok` assertion types

### Requirement 2: Freelancer Agent Assertion Audit

**User Story:** As a freelancer, I want the system to audit client assertions for determinism, so that I only accept verifiable contracts.

#### Acceptance Criteria

1. WHEN the Client_Agent generates assertions, THE Freelancer_Agent SHALL audit each assertion for deterministic verifiability
2. IF an assertion contains vague terms like "quickly", "adequate", or "user-friendly", THEN THE Freelancer_Agent SHALL reject the assertion and propose a concrete alternative
3. WHEN an assertion lacks a specific selector or measurable criteria, THE Freelancer_Agent SHALL convert it into a DOM check, style check, viewport check, or HTTP status check
4. THE Freelancer_Agent SHALL use the Vercel AI SDK with structured outputs to generate audit results conforming to `AuditResultSchema`
5. WHEN all assertions pass audit, THE Freelancer_Agent SHALL mark the contract as ready for authorization

### Requirement 3: PayPal Orders v2 Authorization Flow

**User Story:** As a client, I want to authorize payment for the full project budget, so that funds are held securely in escrow without immediate capture.

#### Acceptance Criteria

1. THE System SHALL use `@paypal/paypal-server-sdk` exclusively for all server-side PayPal integrations
2. WHEN a client initiates escrow funding, THE System SHALL call `ordersController.createOrder` with `intent: CheckoutPaymentIntent.Authorize` and the total project budget formatted as USD (`(totalBudgetCents / 100).toFixed(2)`)
3. WHEN the PayPal order is created, THE System SHALL use `@paypal/react-paypal-js` configured with `intent: "authorize"` to render the approval button in the browser
4. WHEN the client approves the payment in the PayPal popup, THE System SHALL call `ordersController.authorizeOrder({ id: orderId })` on the backend to convert the approved order into an active authorization
5. THE System SHALL extract `result.purchaseUnits[0].payments.authorizations[0].id` as `paypalAuthorizationId`, extract `expirationTime`, and store `paypalOrderId`, `paypalAuthorizationId`, and `authorizationExpiresAt` in the database with contract status `AUTHORIZED`

### Requirement 4: Deterministic Verification Execution

**User Story:** As a freelancer, I want to submit my work for automated verification, so that I receive immediate, deterministic pass/fail feedback.

#### Acceptance Criteria

1. WHEN a freelancer submits a deployment URL for verification, THE Verification_Engine SHALL open a single isolated browser context, navigate to the URL once, and execute all uncaptured assertions sequentially in a `try/finally` block that guarantees `context.close()` and `browser.close()`
2. THE Verification_Engine SHALL connect to the Kernel_API remote browser via `chromium.connectOverCDP(env.KERNEL_WS_ENDPOINT)` when configured, and fall back to local `chromium.launch({ headless: true })` when the environment variable is absent
3. THE Verification_Engine SHALL sort assertions before execution in the order: `dom_exists` → `text_contains` → `computed_style` → `no_horizontal_overflow` → `http_status_ok`, and use `page.request.get(url)` for `http_status_ok` so the browser page never navigates away from the deployment URL
4. FOR `dom_exists` assertions, THE Verification_Engine SHALL verify that `page.locator(selector).count()` is greater than or equal to 1
5. FOR `text_contains` assertions, THE Verification_Engine SHALL verify that `page.locator(selector).first().innerText()` contains the expected substring (case-insensitive)
6. FOR `no_horizontal_overflow` assertions, THE Verification_Engine SHALL call `page.setViewportSize({ width: viewportWidth, height: 812 })` and verify that `Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) <= window.innerWidth`
7. FOR `computed_style` assertions, THE Verification_Engine SHALL verify that `window.getComputedStyle(element).getPropertyValue(property)` matches the expected value
8. FOR `http_status_ok` assertions, THE Verification_Engine SHALL execute `page.request.get(assertion.url)` and verify the HTTP status code is between 200 and 299
9. THE Verification_Engine SHALL enforce a 10-second per-assertion timeout and skip re-evaluating any assertion that already has `status === "PASSED"` and a recorded `captureId`

### Requirement 5: Proportional Delta Partial Capture & Void

**User Story:** As a client, I want the system to capture only the newly passed criteria on each run, so that I pay strictly in proportion to verified progress without double-charging.

#### Acceptance Criteria

1. THE System SHALL allow verification runs when contract status is `AUTHORIZED` or `PARTIALLY_CAPTURED`, and check that `authorizationExpiresAt` has not passed
2. WHEN a verification run completes, THE System SHALL identify newly passed assertions where `status === "PASSED"` and `captureId` is null
3. THE System SHALL calculate `deltaCaptureCents` by summing `dollarValueCents` of only those newly passed assertions
4. IF `deltaCaptureCents` is greater than 0, THE System SHALL calculate whether `(totalCapturedCents + deltaCaptureCents) >= totalBudgetCents` to set the boolean `isFinalCapture`
5. THE System SHALL execute the capture with retry logic (`withRetry`) by calling `paymentsController.captureAuthorizedPayment` with `authorizationId`, `amount: { currencyCode: "USD", value: (deltaCaptureCents / 100).toFixed(2) }`, and `finalCapture: isFinalCapture`
6. WHEN `captureAuthorizedPayment` succeeds, THE System SHALL atomically update each newly passed criterion with `captureId` and `captureTimestamp`, create a `CaptureLedger` record, and set contract status to `COMPLETED` if `isFinalCapture` is true, or `PARTIALLY_CAPTURED` if `isFinalCapture` is false
7. IF the client chooses to cancel remaining uncaptured funds, THE System SHALL call `paymentsController.voidPayment({ authorizationId })` and update the contract status to `VOIDED`

### Requirement 6: Settlement Dashboard Display

**User Story:** As a user, I want to view live assertion status and payment captures in an interactive dashboard, so that I understand the contract state at all times.

#### Acceptance Criteria

1. THE Settlement_Dashboard SHALL use AG_Grid wrapped in a React `ErrorBoundary` to display a table of all 5 assertions with columns for Type, Description, Target (`selector`/`url`/`viewportWidth`), Expected Value, Weight %, Dollar Value, Status Badge, Actual Telemetry Result, and Capture ID
2. WHEN verification results are received, THE Settlement_Dashboard SHALL render `StatusBadge` components showing `PASSED` in green, `FAILED` in red, and `PENDING` in gray
3. THE Settlement_Dashboard SHALL display total authorized, total captured, remaining held in escrow, and pass percentage in a summary bar formatted via `formatUSD(cents)`
4. THE Settlement_Dashboard SHALL display a chronological `CaptureLedger` of all partial captures showing capture ID, formatted USD amount, timestamp, and associated verification run ID
5. THE Settlement_Dashboard SHALL display loading spinners (`Spinner.tsx`) during contract compilation, PayPal authorization, and browser verification runs

### Requirement 7: Zero-Friction Demo Routes & Pre-Seeded Contract

**User Story:** As a hackathon judge, I want to test the full payment flow in under 60 seconds, so that I can evaluate the platform quickly and deterministically.

#### Acceptance Criteria

1. THE System SHALL pre-seed a deterministic demo contract in the database on startup/first load whose 5 assertions match the exact selectors and styles on `/demo/v1-broken` and `/demo/v2-fixed`
2. THE System SHALL provide a Demo_Route at `/demo/v1-broken` that intentionally passes 4 out of 5 assertions (80% weight = $80.00 of $100.00) and fails the `computed_style` check on `.primary-button`
3. THE System SHALL provide a Demo_Route at `/demo/v2-fixed` that passes all 5 assertions (100% weight, triggering the remaining $20.00 delta capture with `finalCapture: true`)
4. WHEN a user navigates to demo routes, THE System SHALL display visible badges indicating which assertions are configured to pass or fail
5. THE Settlement_Dashboard SHALL provide one-click preset buttons that populate the demo route URLs and copyable PayPal Sandbox buyer credentials

### Requirement 8: Deterministic Assertion Interpreter

**User Story:** As a developer, I want a type-safe assertion interpreter rather than dynamic `eval` code generation, so that verification is secure and reliable.

#### Acceptance Criteria

1. THE Verification_Engine SHALL implement an exhaustive `switch` statement with a `default: never` guard over the `assertion.type` discriminated union
2. THE Verification_Engine SHALL NOT use `eval()` or `new Function()` to execute JavaScript strings
3. THE Verification_Engine SHALL wrap every assertion execution in `executeAssertionSafe()` with a 10-second timeout and custom `VerificationEngineError` handling

### Requirement 9: Contract & Verification Run Persistence

**User Story:** As a user, I want my contracts, verification runs, and capture history to be persisted in integer cents, so that I can track progress without floating-point rounding errors.

#### Acceptance Criteria

1. THE System SHALL store all monetary values (`totalBudgetCents`, `dollarValueCents`, `amountCents`) as integers in cents (`Int` in Prisma)
2. THE System SHALL store `EscrowContract`, `Criterion`, `VerificationRun`, and `CaptureLedger` models in SQLite via Prisma ORM
3. THE System SHALL record a `VerificationRun` entry for every verification execution (even when `deltaCaptureCents === 0`) containing `id`, `contractId`, `deploymentUrl`, `passCount`, `failCount`, `resultsJson`, and `runAt`

### Requirement 10: PayPal Agent Toolkit & Custom Escrow Tools Integration

**User Story:** As a developer, I want to combine `@paypal/agent-toolkit` with custom Orders v2 partial-capture tools, so that agents can orchestrate the escrow lifecycle.

#### Acceptance Criteria

1. THE System SHALL initialize `@paypal/agent-toolkit` configured with `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and Sandbox environment
2. BECAUSE `@paypal/agent-toolkit` does not natively include a partial-capture tool, THE System SHALL register custom Vercel AI SDK tool definitions (`authorize_escrow_order`, `capture_proportional_milestone`, and `void_escrow_authorization`) powered by `@paypal/paypal-server-sdk` alongside the toolkit
3. THE System SHALL log all Agent Toolkit and custom tool invocations with redacted payloads and timestamps in the `AgentTelemetry` UI panel

### Requirement 11: Deployment Infrastructure

**User Story:** As a developer, I want the application to deploy cleanly to Render, so that judges can test a live HTTPS instance.

#### Acceptance Criteria

1. THE System SHALL include a `render.yaml` file defining the web service, build command, persistent SQLite disk mount, and all environment variables including `NEXT_PUBLIC_PAYPAL_CLIENT_ID`
2. THE System SHALL use `@paypal/paypal-server-sdk` configured with `Environment.Sandbox`

### Requirement 12: Structured Output Schema Validation

**User Story:** As a developer, I want AI agent outputs to conform to strict schemas, so that downstream verification logic receives valid data structures.

#### Acceptance Criteria

1. ALL Zod schemas for assertions, contracts, audits, and API request bodies SHALL reside in `lib/schemas.ts` as the single source of truth
2. WHEN the Vercel AI SDK generates structured output, THE System SHALL validate the output against the Zod schema and retry up to 3 times using `withRetry` before falling back to the deterministic demo contract

### Requirement 13: Unified Split-Screen Client-Freelancer Workspace

**User Story:** As a judge, I want to see and interact with both Client and Freelancer controls on a single screen, so that I can test the entire workflow without hidden menus.

#### Acceptance Criteria

1. THE Settlement_Dashboard SHALL render a unified view containing `ClientPanel`, `FreelancerPanel`, `SettlementMatrix`, `CaptureLedger`, and `AgentTelemetry` on the same page
2. THE Settlement_Dashboard SHALL include a `RoleHighlightToggle` ("All Roles View", "Client Focus", "Freelancer Focus") that visually highlights the active role's panel without hiding controls

### Requirement 14: Assertion Weight & Cent Allocation Validation

**User Story:** As a client, I want assertion weights to always sum to 100% and cent allocations to sum to the exact total budget in cents.

#### Acceptance Criteria

1. WHEN the Client_Agent generates assertions, THE System SHALL validate that the integer sum of all assertion weights equals exactly 100
2. THE System SHALL compute each criterion's `dollarValueCents` as `Math.round((assertion.weight * totalBudgetCents) / 100)` and adjust the final criterion by any remainder so the sum of `dollarValueCents` equals `totalBudgetCents` exactly

### Requirement 15: Parser and Pretty Printer for Assertion Contracts

**User Story:** As a developer, I want to parse and format assertion contracts deterministically, so that contracts can be stored, transmitted, and verified reliably.

#### Acceptance Criteria

1. THE System SHALL provide `parseAssertionContract()` in `lib/parser.ts` that validates JSON strings against `EscrowContractSchema` and throws `ParserError` with field details on failure
2. THE System SHALL provide `prettyPrintContract()` in `lib/pretty-printer.ts` using 2-space indentation and recursively sorted object keys
3. FOR ALL valid contract objects, parsing then pretty-printing then parsing SHALL produce an equivalent object

### Requirement 16: API Request Validation & Consistent Error Schema

**User Story:** As a developer, I want all API endpoints to validate incoming request bodies and return structured error payloads with trace IDs.

#### Acceptance Criteria

1. EVERY API route SHALL validate incoming request bodies using a Zod schema from `lib/schemas.ts` before executing business logic
2. IF request validation or JSON parsing fails, THE System SHALL return HTTP 400 conforming to `ApiErrorResponse` (`{ error, source, code, details, traceId }`)
3. ALL client-side API requests SHALL use the reusable `apiFetch` wrapper in `lib/api-client.ts`, which automatically attaches `headers: { 'Content-Type': 'application/json' }`

### Requirement 17: Concurrent Verification Prevention

**User Story:** As a client, I want the system to prevent concurrent verification runs on the same contract, so that I am never double-charged for the same assertion.

#### Acceptance Criteria

1. WHEN a verification run begins, THE System SHALL atomically check that `verificationInProgress` is `false` and set `verificationInProgress = true` on the `EscrowContract` record
2. IF a verification request arrives while `verificationInProgress` is `true`, THE System SHALL immediately return HTTP 409 Conflict with code `VERIFICATION_IN_PROGRESS`
3. WHEN a verification run completes or throws an error, THE System SHALL reset `verificationInProgress = false` in a `finally` block
4. THE System SHALL wrap database updates for criteria, `VerificationRun`, `CaptureLedger`, and contract status inside `prisma.$transaction()`

### Requirement 18: Contract State Retrieval

**User Story:** As a user, I want to fetch the current state of a contract, so that the dashboard can display up-to-date information.

#### Acceptance Criteria

1. THE System SHALL provide `GET /api/contract/[id]` returning the contract, criteria, capture ledger, and verification runs ordered by `runAt` descending
2. IF no `[id]` is specified or `id === "default"`, THE endpoint SHALL return (or seed if missing) the default deterministic demo contract
3. THE response SHALL include computed fields: `totalCapturedCents`, `remainingAuthorizedCents`, and `passPercentage`

### Requirement 19: Security Hardening

**User Story:** As a developer, I want the system to follow strict security practices, so that secrets are protected and SSRF/injection vectors are blocked.

#### Acceptance Criteria

1. THE System SHALL create `.gitignore` prior to git initialization excluding `.env*` (except `.env.example`), `node_modules/`, `.next/`, `*.db*`, and `data/`
2. THE System SHALL validate all required environment variables at startup via `lib/env.ts`
3. THE System SHALL validate deployment URLs via `DeploymentUrlSchema` in `lib/sanitize.ts`, blocking private IPs (`10.*`, `172.16-31.*`, `192.168.*`), loopback (`localhost`, `127.0.0.1`), and cloud metadata (`169.254.169.254`), while explicitly permitting the application's own `/demo/v1-broken` and `/demo/v2-fixed` routes
4. THE System SHALL validate CSS selectors via `isSafeSelector()` to reject `javascript:`, `expression()`, `url()`, and `eval()`
5. THE System SHALL configure security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Content-Security-Policy`) in `next.config.js`
6. THE System SHALL redact sensitive keys (`secret`, `password`, `apiKey`, `token`, `authorization`) in `lib/trace.ts` before logging
