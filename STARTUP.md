# Startup & Run Guide — PayPal Agentic Escrow

This file tells you exactly how to run the project locally, what environment variables you need to add, where to add them, and what actions are required from you.

---

## 1. Prerequisites

| Tool | Required Version | How to check |
|------|-----------------|--------------|
| Node.js | 20.9.0+ | `node -v` |
| npm | 10+ | `npm -v` |
| Git | any | `git --version` |
| OpenAI API key | `sk-...` | From [platform.openai.com](https://platform.openai.com) |
| PayPal Sandbox credentials | `sb-...` / `EX-...` | From [developer.paypal.com](https://developer.paypal.com/dashboard/applications/sandbox) |

> The repo already has `node_modules/` installed and a Prisma migration applied. You do **not** need to reinstall dependencies unless you change `package.json`.

---

## 2. Step-by-Step: Run Locally

### Step 1 — Copy the environment template

```bash
cp .env.example .env.local
```

### Step 2 — Add your environment variables to `.env.local`

Open `.env.local` in a text editor and replace the placeholder values with your real credentials:

```env
# === PayPal (Sandbox) ===
# Get these from https://developer.paypal.com/dashboard/applications/sandbox
PAYPAL_CLIENT_ID=sb-YOUR_REAL_CLIENT_ID
PAYPAL_CLIENT_SECRET=EX-YOUR_REAL_SECRET
NEXT_PUBLIC_PAYPAL_CLIENT_ID=sb-YOUR_PUBLIC_CLIENT_ID

# === OpenAI (used by Client_Agent / Freelancer_Agent) ===
# Get this from https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-YOUR_REAL_OPENAI_KEY

# === Database ===
# SQLite file (created automatically). Keep as-is unless you want a different path.
DATABASE_URL=file:./dev.db

# === Application ===
NEXT_PUBLIC_APP_URL=http://localhost:3000

# === Optional: Kernel cloud browser ===
# Leave blank to use local headless Chromium.
KERNEL_WS_ENDPOINT=

# === Optional: Demo sandbox buyer credentials (shown as copyable pills in UI) ===
PAYPAL_SANDBOX_BUYER_EMAIL=buyer@example.com
PAYPAL_SANDBOX_BUYER_PASSWORD=password
```

### Step 3 — Generate the Prisma client

```bash
npx prisma generate
```

### Step 4 — Seed the demo contract (optional but recommended)

This creates the default deterministic demo contract (5 criteria, $20.00 each, $100.00 total) so the dashboard has data on first load.

```bash
npm run prisma:seed
```

### Step 5 — Start the development server

```bash
npm run dev
```

Open **http://localhost:3000** in your browser.

---

## 3. What You Need to Do as the User (Environment Variables)

| Action | Where | What to put |
|--------|-------|-------------|
| **Create/edit `.env.local`** | Project root (`D:\vedant\coding\proj\paypal\.env.local`) | See table below |
| **Get PayPal Sandbox credentials** | [developer.paypal.com](https://developer.paypal.com/dashboard/applications/sandbox) → "Sandbox" → "Accounts" → create a Business account → copy Client ID & Secret | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` |
| **Get PayPal public client ID** | Same PayPal dashboard → copy the `sb-...` public ID | `NEXT_PUBLIC_PAYPAL_CLIENT_ID` |
| **Get OpenAI API key** | [platform.openai.com](https://platform.openai.com/api-keys) → "Create secret key" | `OPENAI_API_KEY` (must start with `sk-`) |

### Required environment variables

| Variable | Required | Example | Where to get it |
|----------|----------|---------|-----------------|
| `PAYPAL_CLIENT_ID` | Yes | `sb-xxxxxxx` | PayPal Developer Dashboard → Sandbox → App |
| `PAYPAL_CLIENT_SECRET` | Yes | `EX-xxxxxxx` | PayPal Developer Dashboard → Sandbox → App |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Yes | `sb-xxxxxxx` | PayPal Developer Dashboard → Sandbox → App (public ID) |
| `OPENAI_API_KEY` | Yes | `sk-xxxxxxx` | OpenAI Platform → API Keys |
| `DATABASE_URL` | Yes | `file:./dev.db` | Can stay as default |
| `NEXT_PUBLIC_APP_URL` | No | `http://localhost:3000` | Your local dev URL |
| `KERNEL_WS_ENDPOINT` | No | (blank) | Leave blank for local Chromium |

### Never commit secrets
- `.env.local` is **gitignored** — never commit it.
- `.env.example` is committed but contains only placeholders.
- If you accidentally commit a real secret, rotate it immediately on PayPal and OpenAI dashboards.

---

## 4. Available npm Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `npm run dev` | `next dev` | Start dev server on http://localhost:3000 |
| `npm run build` | `prisma generate && next build` | Production build |
| `npm run start` | `next start` | Start production server |
| `npm run lint` | `eslint .` | Run ESLint |
| `npm run typecheck` | `tsc --noEmit` | TypeScript strict check |
| `npm run prisma:generate` | `prisma generate` | Generate Prisma client |
| `npm run prisma:migrate` | `prisma migrate dev` | Run database migrations |
| `npm run prisma:seed` | `tsx prisma/seed.ts` | Seed demo contract |
| `npm test` | `vitest run` | Run unit tests |

---

## 5. 60-Second Judge Demo Flow

1. Open http://localhost:3000 — the dashboard loads with the pre-seeded demo contract ($100.00, 5 criteria at $20.00 each).
2. **Client Panel:** Click "Compile contract with AI agents" (uses demo fallback), then click "Authorize $100.00" to create + authorize a PayPal order.
3. **Freelancer Panel:** Click "Test v1-broken (4/5 -> $80)" — verification runs, 4/5 pass, $80.00 captured (`PARTIALLY_CAPTURED`).
4. **Freelancer Panel:** Click "Test v2-fixed (5/5 -> +$20)" — verification runs, 5/5 pass, remaining $20.00 captured with `finalCapture: true` → status becomes `COMPLETED`.
5. Watch the Settlement Matrix, Capture Ledger, and Agent Telemetry panels update in real time.

**Demo routes:**
- `/demo/v1-broken` — 4/5 assertions pass (computed_style fails: blue instead of green button)
- `/demo/v2-fixed` — 5/5 assertions pass (green button)

---

## 5. Verify Everything Works

```bash
npm run typecheck   # must be clean
npm run lint        # must have 0 errors
npm run build       # must succeed
npm test            # 28 unit tests pass
```

For the full dashboard e2e flow:
1. Start the server: `npm run dev`
2. Run: `DASHBOARD_URL=http://localhost:3000 npx tsx tests/e2e-dashboard.ts`
3. All 18 checks should pass.

---

## 6. Deploy to Render

A `render.yaml` is included. To deploy:

1. Push this repo to GitHub.
2. In Render, create a new **Web Service** from the repo.
3. Render will detect `render.yaml` and use:
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
   - Persistent disk mounted at `/opt/render/project/src/data` (for SQLite)
4. Add all required environment variables in the Render dashboard (see section 3).
5. After deploy, run `npx prisma migrate deploy` on the Render instance (or set it as a pre-deploy command).

---

## 7. Folder Structure (quick reference)

```
paypal-agentic-escrow/
 app/              # Next.js App Router (pages + API routes only)
 components/       # React components (UI only, no data fetching)
 hooks/            # Custom React hooks (data fetching)
 lib/              # Pure TypeScript business logic (no React)
 prisma/           # Prisma schema + migrations
 public/           # Static assets (paypal-logo.svg)
 types/            # Shared TypeScript types
 tests/            # Unit + e2e tests
 .env.example      # Committed env template (placeholders only)
 .env.local        # YOUR secrets (gitignored — create this!)
 next.config.js    # Next.js config + security headers
 package.json      # Dependencies & scripts
 prisma/schema.prisma  # Database models (integer cents)
 render.yaml       # Render.io deployment config
 tsconfig.json     # Strict TypeScript config
 README.md         # Project overview
 TECH_STACK.md     # Full tech stack explanation (this project's technologies)
 STARTUP.md        # This file
```

---

## 8. Troubleshooting

| Problem | Fix |
|---------|-----|
| `npx tsc --noEmit` fails | Run `npm install` to ensure all types are present; check `.env.local` exists |
| `prisma:seed` fails | Run `npx prisma migrate dev` first, then `npx prisma generate` |
| PayPal button doesn't appear | Ensure `NEXT_PUBLIC_PAYPAL_CLIENT_ID` is set in `.env.local` |
| Verification returns 409 | A previous run is still in progress; wait a moment and retry |
| Port 3000 already in use | Kill the existing process: `taskkill /F /IM node.exe` (Windows) or change `NEXT_PUBLIC_APP_URL` |
| Build fails on AG Grid | Ensure `ag-grid-community` and `ag-grid-react` are installed in `package.json` |

---

## 9. License

MIT