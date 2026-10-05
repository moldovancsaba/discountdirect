# HANDOVER: DiscountDirect
Date: 2026-10-05. Owner: moldovancsaba. Board: https://github.com/users/moldovancsaba/projects/61. Repo: https://github.com/moldovancsaba/discountdirect. Production: https://discountdirect.vercel.app.

## What this is
A Hungarian-language web application where sellers turn their own customers' purchase history into explainable recommendations, personal offers, flash campaigns and recurring offer lists, and where buyers converse with sellers and accept or decline. Each seller sees only its own customers. Sign-in is DoneIsBetter SSO only. It is NOT a payment processor, a general marketplace, or a bulk-mailing tool: e-mail is limited to staged recipients and postal delivery is not certified with any vendor ([README.md](README.md), [docs/implementation-baseline.md](docs/implementation-baseline.md)).

## State today
- Version 1.5.0 (`package.json`). `RELEASE_NOTES.md` also lists unreleased work (connectors, checkout hand-off, seller settings, pricing guardrails and evidence, holdout reporting, postal PDFs and fulfillment).
- Stack: Next.js 15.5.21, React 19, TypeScript 6, MongoDB Atlas via Mongoose, GDS 6.7.0, Node 24.x, pnpm 10.30.3.
- Deploy target: Vercel project `narimato/discountdirect`. `vercel.json` sets the Next.js framework, `pnpm build`, frozen-lockfile install, four crons (automations every 30 min, deliveries every 15, journeys every 10, metrics hourly) and a 300 s limit for `api/socket-io.ts`. Documented release path: pass the gate, push to `main`, run `vercel deploy --prod --scope narimato` ([docs/operations.md](docs/operations.md)). Whether a push deploys automatically is unverified.
- Production check on 2026-10-05: `GET /api/health/live` returned 200 with version 1.5.0. Which commit is deployed is unverified.
- Last commit: 2026-09-30, `6dad5ed` "Add consolidated release readiness report" (adds `pnpm release:readiness`). 216 commits in total, 130 of them on 2026-09-25.
- Works (per docs, not re-run in this pass): SSO access and revocation, seller catalog and purchase imports, privacy and consent, recommendations, conversations with realtime, offers, flash campaigns, automations, journeys, delivery outbox with staged Resend e-mail, coupons, postal PDFs and fulfillment queue, reporting projections.
- Known gaps (docs/implementation-baseline.md): no postal vendor certified; connector order write-back unsupported; live Shoprenter sandbox, Blob and Redis acceptance need deployment credentials; WhatsApp and RCS are contract foundations only; no public registration; broad customer e-mail rollout is not approved ([docs/privacy-controller-record-2026-09-12.md](docs/privacy-controller-record-2026-09-12.md)).
- Tests, lint and build were not run while writing this handover.

## Run, test, deploy
Required variable names are in [.env.example](.env.example); values go in `.env.local` (never commit).
```sh
pnpm install --frozen-lockfile   # install
pnpm dev                         # local server
pnpm test                        # node --test tests/*.test.ts
pnpm check                       # gate: lint, typecheck, test, gds:manifest, gds:check, build (CI runs it)
pnpm db:check                    # read-only Atlas ping, needs .env.local
pnpm db:indexes                  # create declared indexes
pnpm start                       # production server (own terminal); then run: pnpm test:smoke
pnpm release:readiness           # lists blocked external prerequisites, exits 2 while any is blocked
pnpm ops:monitor                 # production health monitor
vercel deploy --prod --scope narimato   # documented production deploy
```
More checks and recovery runbooks: [docs/operations.md](docs/operations.md).

## In flight
- Board #61 (private) holds 45 items: 30 Done, 15 Review (ALMOST). The 15 open issues are exactly the Review items, and each carries the `blocked` label. No open pull requests (#21 to #24 are merged).
- Most important open issues: #49 Release: remaining scope production gate (P0); #46 Redis operational primitives (P0); #31 Blob artifact persistence (P0); #29 Order write-back and stock reconciliation (P0); #27 and #28 Shoprenter and UNAS connectors (P1).
- Four remote feature branches besides `main` still exist on origin (`git branch -r`); check them before deleting.

## Traps and decisions
- One project, four names: folder `discount.direct`, GitHub repo and npm package `discountdirect`, Vercel `narimato/discountdirect` (Vercel team differs from the GitHub owner).
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) is historical (see its banner). Variable names there, such as `MONGODB_DB_NAME`, are superseded by `.env.example` (`MONGODB_DB`).
- [docs/implementation-baseline.md](docs/implementation-baseline.md) is the local source of truth and must be updated in the same change as any stack, route, environment, model or provider change (its maintenance rule).
- `.github/ISSUE_TEMPLATE/implementation.md` still shows `npm` commands and planned scripts that do not exist. Use the pnpm scripts above.
- GDS packages install from pinned 6.7.0 release tarballs because GitHub Packages delivery hit a billing limit ([docs/architecture.md](docs/architecture.md)). `.npmrc` still maps `@sovereignsquad` to GitHub Packages; no token is needed for install.
- Human login is SSO only; `OPERATIONS_TOKEN` is a machine bearer token for readiness probes, not a login ([docs/authentication.md](docs/authentication.md)).
- Redis absent means degraded but correct operation; MongoDB stays authoritative ([docs/operations.md](docs/operations.md)).
- `ops:monitor`, `test:quality-release` and `test:realtime-production` read production values from `.env.production.local`; the `*-integration` tests use disposable databases. `/experience` is in-memory synthetic data, and `pnpm fixtures:prototype` refuses to run against production.
- Kill switches: `REALTIME_ENABLED=false` (sockets only), `HANDOFF_ENABLED=false` (then `pnpm handoff:revoke`), empty `EMAIL_DELIVERY_PROVIDER` or `POSTAL_DELIVERY_PROVIDER`.
- Realtime uses Vercel's beta WebSocket support ([docs/realtime.md](docs/realtime.md)).
- `pnpm-workspace.yaml` contains placeholder-looking `allowBuilds` text; install scripts are allowed only for `sharp` and `unrs-resolver` ([docs/architecture.md](docs/architecture.md)). Leave it unless install behavior needs a deliberate change.

## First hour for the next agent
1. Read [AGENTS.md](AGENTS.md), [README.md](README.md), [docs/INDEX.md](docs/INDEX.md), then the baseline and operations docs.
2. Run `git config user.email` (must be `moldovancsaba@gmail.com`) and `git status`.
3. Confirm `.env.local` exists without printing it; if missing, copy `.env.example` and ask the owner for values.
4. Run `pnpm install --frozen-lockfile` then `pnpm check`; record any failure before changing anything.
5. Run `pnpm db:check`, then `curl https://discountdirect.vercel.app/api/health/live` and compare the version with `package.json`.
6. Run `pnpm release:readiness` to see which integrations are still blocked.
7. Open board #61 and issue #49, and decide with the owner which Review item to close first.

## Where things live
- [docs/INDEX.md](docs/INDEX.md): every document, with currency notes.
- `src/<domain>/`: service, models and HTTP helpers per capability; `src/app/`: pages and API routes; `api/socket-io.ts`: realtime endpoint.
- `scripts/`: operations, drills and verification; `tests/`: domain tests; `gds-adoption.json`: GDS compliance manifest.
- [RELEASE_NOTES.md](RELEASE_NOTES.md): changelog. `.github/workflows/quality.yml`: CI (`pnpm check`).
