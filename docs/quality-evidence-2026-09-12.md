# Quality evidence — 2026-09-12

Release 1.5.0 was verified against the production alias `https://discountdirect.vercel.app` after audited access revocation, realtime and operations checks.

## Release checks

- `pnpm check`: passed.
- `vercel deploy --prod --yes`: passed; production deployment `dpl_4HtzhSAkAy8htM3WWmt8N7JjEqAS`.
- `pnpm test:auth-integration`: passed against temporary isolated Atlas collections.
- `pnpm db:indexes`: passed.
- `pnpm db:restore-drill`: passed using disposable `dd_restore_441e1b679b` database and removed synthetic probe data.
- `git diff --check`: passed.
- `pnpm test:quality-release`: passed against production.
- `pnpm ops:monitor`: passed against production liveness, readiness and cron checks.
- `pnpm test:realtime-production -- --base-url=https://discountdirect.vercel.app --require-distinct-runtime`: passed against production synthetic users and cleaned up probe data.

## Critical paths

| Path | Evidence | Result |
| --- | --- | --- |
| Public overview | Hungarian root shell, skip link and `main` landmark render on `/`. | Pass |
| Sign-in | E-mail/password labels, autocomplete hints and SSO action render on `/sign-in`. | Pass |
| Operator gate | `/admin` renders only the access form until an operator session exists. | Pass |
| Protected buyer/seller routes | `/account`, `/buyer/offers`, `/buyer/lists`, `/buyer/redemptions` and `/seller/sample-shop` redirect unauthenticated users to `/sign-in`. | Pass |
| Liveness | `/api/health/live` returns 200 with service `discountdirect` and version `1.5.0`. | Pass |
| Readiness | `/api/health/ready` returns 401 without a token and 200 with the operator token. | Pass |
| Cron | `/api/cron/automations` returns 401 without `CRON_SECRET` and 200 with a bounded result set when authorized. | Pass |
| Access revocation | `pnpm test:auth-integration` verifies session revocation, user disable, seller membership revocation and buyer relationship revocation with `AuthAuditEvent` records. | Pass |
| Realtime | Production WebSocket upgrade returned `101 Switching Protocols`; strict realtime probe passed with seller and buyer on distinct Vercel runtime instances. | Pass |
| Rollback recovery | Vercel rollback remains available to the last verified 1.4.1 access release `dpl_JE3Y5ctssB43zTBj83Hev4UQQAUk`; realtime can also be disabled with `REALTIME_ENABLED=false` and a redeploy while durable HTTP conversations remain authoritative. | Pass |

## Accessibility matrix

| Area | Evidence | Result |
| --- | --- | --- |
| Language | Root layout sets `lang="hu"` and GDS provider locale is Hungarian. | Pass |
| Keyboard entry | Root layout includes a skip link to `#main`; sidebar navigation has an explicit aria label. | Pass |
| Labels | Authentication, activation, seller forms, buyer preferences, conversation replies and redemption confirmation use labeled GDS inputs. | Pass |
| Focus and reduced motion | GDS focus behavior is active through the theme provider; local CSS honors `prefers-reduced-motion: reduce`. | Pass |
| Status without color-only meaning | Runtime states use text labels and GDS status/banners, including unauthorized, unsupported delivery, suppressed delivery, disabled realtime and redemption states. | Pass |
| Reflow | Core grids use responsive GDS grid settings or wrapping button rows; catalog forms use responsive minmax columns. | Pass |
| Print view | Buyer letters use a dedicated print layout and do not claim postal fulfillment. | Pass |

## Recovery and limits

No real customer delivery was triggered during verification. Production delivery rows remain honest outbox states until issue #20 selects and verifies an external transport. Realtime is enabled for release 1.5.0 after the Vercel WebSocket production probe passed with synthetic users.
