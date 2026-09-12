# Data environment evidence — 2026-09-12

## Vercel project

DiscountDirect remains linked to the existing Vercel project `narimato/discountdirect`.

Configured environment variable names:

- Production: `MONGODB_URI`, `MONGODB_DB`, `OPERATIONS_TOKEN`, `CRON_SECRET`, SSO variables.
- Preview: `MONGODB_URI`, `MONGODB_DB`, SSO variables.
- Development: `MONGODB_URI`, `MONGODB_DB`, `OPERATIONS_TOKEN`, `CRON_SECRET`, SSO variables.

Database names:

- Production: `discountdirect`.
- Preview: `discountdirect_preview`.
- Development/local Vercel pull: `discountdirect_development`.
- Integration verification: randomly named `discountdirect_auth_verify_*` databases that are removed after the run.
- Restore drill: randomly named `dd_restore_*` databases that remove their synthetic probe collection after verification. The app credential is intentionally not allowed to drop databases.

## Network and residual risk

The current MVP uses Vercel dynamic outbound networking to Atlas with server-only connection strings. No static egress or Secure Compute purchase was made. The residual risk is documented: before real customer marketing launch, the owner must either accept dynamic egress with Atlas monitoring or fund a stricter static-egress posture.

## Evidence commands

- `vercel env ls` confirmed `MONGODB_DB` exists in Production, Preview and Development.
- `pnpm db:check` verifies read-only Atlas readiness.
- `pnpm db:indexes` creates declared indexes in the configured database.
- `pnpm test:auth-integration` writes to an isolated temporary database and removes it.
- `pnpm db:restore-drill` writes one synthetic probe to a disposable database, exports it in memory, deletes it, restores it, verifies equality and removes the probe data. It also proves the application credential cannot rely on broad database-drop privileges.

## Recovery

If the production database is unreachable, `/api/health/live` remains public while authenticated `/api/health/ready` reports unavailable. Use `docs/operations-alerts.md` for escalation, verify `MONGODB_URI` and `MONGODB_DB` by name only, run `pnpm db:check`, and use Atlas backup/restore tooling for real data recovery. The synthetic restore drill is not a substitute for a full Atlas backup restore of production data; it proves the application credential can perform bounded write/read/delete/restore behavior against a disposable database without broad destructive privileges.
