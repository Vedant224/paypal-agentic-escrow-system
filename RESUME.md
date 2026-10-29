# Resume Notes — PayPal Agentic Escrow

Last updated: after commit `2f64c02` (Wave 3 complete).

## Current status

| Wave | Scope | State |
|------|-------|-------|
| 0 | Security first, Next.js 15 init, strict tsconfig, security headers, deps | DONE |
| 1 | `lib/` env, errors, trace, retry, format, sanitize | DONE |
| 2 | `lib/schemas.ts`, `types/index.ts`, parser, pretty-printer, tests | DONE |
| 3 | Prisma schema + migration, `lib/prisma.ts`, `lib/demo-seed.ts` | DONE |
| 4 | `paypal-client.ts`, `agent-tools.ts`, `browser-connector.ts`, `verification-engine.ts` | TODO |
| 5 | API routes under `app/api/` | TODO |
| 6 | Demo routes `/demo/v1-broken`, `/demo/v2-fixed` | TODO |
| 7 | `lib/api-client.ts`, hooks, `components/ui/`, `components/layout/` | TODO |
| 8 | `SettlementMatrix`, `CaptureLedger`, `AgentTelemetry`, panels, dashboard | TODO |
| 9 | `render.yaml`, `.env.example`, `LICENSE`, `README.md`, pre-flight | TODO |

`tasks.md` in `.kiro/specs/paypal-agentic-escrow/` carries the authoritative
checkbox state. Keep ticking each subtask as it lands.

## Verification gates to run before each checkpoint commit

```bash
npx tsc --noEmit     # must be clean
npx vitest run       # must be all green
```

## Environment notes

- `DATABASE_URL=file:./dev.db` (SQLite, resolved relative to `prisma/`).
  The dev DB is already migrated (`20261028172901_init`) and seeded.
- `.env.local` holds placeholder credentials so `lib/env.ts` passes its
  startup validation. Replace with real Sandbox keys before a live demo.
- Playwright Chromium is already installed (`chromium-headless-shell`).
- The demo contract id is `00000000-0000-4000-8000-000000000001`.
- `prisma/migrations/migration_lock.toml` is intentionally gitignored per
  `CODING_RULES.md`; `prisma migrate deploy` was verified to work without it.

## Tooling caveats (also saved as the `windows-git-edit-pitfalls` skill)

- The `patch` tool can write git conflict markers into a file. Prefer
  `write_file` or `execute_code` for edits. If it happens:
  `git checkout HEAD -- <file>` then `git reset HEAD <file>`.
- `git push` hangs on this host (no `gh`, encrypted SSH key, GCM hangs under
  `git credential fill`). Commit locally; the user pushes.

## Next concrete step (Wave 4)

Create `lib/paypal-client.ts` with the SDK v2 `Client` / `OrdersController` /
`PaymentsController` initialised for `Environment.Sandbox`, then
`lib/agent-tools.ts`, `lib/browser-connector.ts` and `lib/verification-engine.ts`
per the design document's code samples. Note `lib/verification-engine.ts` must
use `page.request.get()` for `http_status_ok` so the page never navigates away,
and must sort assertions so `http_status_ok` runs last.
