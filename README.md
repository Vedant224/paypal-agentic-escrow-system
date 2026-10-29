# PayPal Agentic Escrow

AI-negotiated escrow contracts with deterministic browser verification and proportional delta partial capture via PayPal Orders v2.

## What it does

The PayPal Agentic Escrow System lets clients fund a project in escrow (PayPal authorization) and release payment only as freelancer work passes automated verification checks. Funds are captured proportionally — each newly verified acceptance criterion releases its allocated share — so clients pay strictly in proportion to verified progress and freelancers get paid as they hit milestones.

## Core flows

1. **Client_Agent** — converts a natural-language project brief into exactly 5 weighted acceptance criteria (weights sum to 100%) using the Vercel AI SDK with structured Zod outputs.
2. **Freelancer_Agent** — audits criteria for deterministic verifiability and proposes concrete replacements for vague rules.
3. **PayPal authorization** — the full budget is authorized (not captured) and held in escrow.
4. **Deterministic verification** — a headless browser runs 5 assertion types (`dom_exists`, `text_contains`, `computed_style`, `no_horizontal_overflow`, `http_status_ok`) against the freelancer's deployed URL, sorted so `http_status_ok` runs last via a non-navigational `page.request.get()`.
5. **Proportional delta capture** — only newly passed, previously uncaptured criteria are captured, with atomic database transactions and an optimistic concurrency lock to prevent double-charging.

## Architecture

```
Next.js 15 App Router
├── UI: ClientPanel, FreelancerPanel, SettlementMatrix (AG Grid),
│    CaptureLedger, AgentTelemetry, unified dashboard
├── API: contract compile/audit/GET, PayPal create-order/authorize/void,
│    verify-and-capture (atomic delta capture + concurrency lock)
└── lib: env validation, custom errors, trace logging, retry, sanitize,
     schemas (single-source Zod), parser, pretty-printer, paypal-client,
     agent-tools, browser-connector, verification-engine
└── Persistence: Prisma + SQLite (integer cents, VerificationRun model)
```

## Demo (60-second judge flow)

Two pre-built demo routes ship with deterministic assertions:

| Route | Result | Captured |
|-------|--------|----------|
| `/demo/v1-broken` | 4/5 assertions pass (style check fails) | $80.00 of $100.00 |
| `/demo/v2-fixed` | 5/5 assertions pass | remaining $20.00, `finalCapture: true` → `COMPLETED` |

The default demo contract is pre-seeded with five $20.00 criteria matching the exact selectors on those routes.

## Quick start

```bash
# Install
npm install

# Generate Prisma client
npx prisma generate

# Copy env template and add your sandbox credentials
cp .env.example .env.local
# Edit .env.local: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, OPENAI_API_KEY

# Seed the demo contract
npm run prisma:seed

# Start
npm run dev
```

Open http://localhost:3000 for the unified dashboard.

## Verification & checks

```bash
npm run typecheck   # tsc --noEmit (strict mode)
npm run lint        # eslint
npm run build       # next build
npm test            # vitest
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PAYPAL_CLIENT_ID` | yes | PayPal Sandbox client ID |
| `PAYPAL_CLIENT_SECRET` | yes | PayPal Sandbox secret |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | yes | Public PayPal client ID (browser) |
| `OPENAI_API_KEY` | yes | OpenAI API key for agents |
| `DATABASE_URL` | yes | SQLite path (e.g. `file:./dev.db`) |
| `NEXT_PUBLIC_APP_URL` | no | App origin (default `http://localhost:3000`) |
| `KERNEL_WS_ENDPOINT` | no | Remote Kernel CDP endpoint (falls back to local Chromium) |

## Security

- All monetary values stored as integer cents (no floating-point drift)
- SSRF blocklist: private IPs, loopback, and cloud metadata blocked; official `/demo/*` routes explicitly permitted
- CSS selectors sanitized before Playwright execution
- All API request bodies validated with Zod
- Custom error classes with `[file::function]` context for traceability
- Nested `try/finally` for browser/resource cleanup
- Optimistic `verificationInProgress` lock prevents concurrent runs
- `secrets` redacted from structured logs

## Deploy to Render

A `render.yaml` is included. Mount a persistent disk for the SQLite database and set all required environment variables in the Render dashboard.

## License

MIT
