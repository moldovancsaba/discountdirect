# Quality evidence — 2026-09-12

Release 1.4.1 was verified against the production alias `https://discountdirect.vercel.app` after rollback, restore and audited access revocation checks.

## Release checks

- `pnpm check`: passed.
- `vercel build --prod --yes`: passed.
- `pnpm test:auth-integration`: passed against temporary isolated Atlas collections.
- `pnpm db:indexes`: passed.
- `pnpm db:check`: passed.
- `git diff --check`: passed.
- `pnpm test:quality-release`: passed against production.

## Critical paths

| Path | Evidence | Result |
| --- | --- | --- |
| Public overview | Hungarian root shell, skip link and `main` landmark render on `/`. | Pass |
| Sign-in | E-mail/password labels, autocomplete hints and SSO action render on `/sign-in`. | Pass |
| Operator gate | `/admin` renders only the access form until an operator session exists. | Pass |
| Protected buyer/seller routes | `/account`, `/buyer/offers`, `/buyer/lists`, `/buyer/redemptions` and `/seller/sample-shop` redirect unauthenticated users to `/sign-in`. | Pass |
| Liveness | `/api/health/live` returns 200 with service `discountdirect` and version `1.4.1`. | Pass |
| Readiness | `/api/health/ready` returns 401 without a token and 200 with the operator token. | Pass |
| Cron | `/api/cron/automations` returns 401 without `CRON_SECRET` and 200 with a bounded result set when authorized. | Pass |
| Rollback recovery | Vercel rolled back to `dpl_53tW4ENKFk1pjaU3gWA3yg6Bzcsa`, then restored `dpl_C2MwMxdpoZays3KgBqwUpQsBnMS5`; health and readiness passed after restore. | Pass |

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

No real customer delivery was triggered during verification. Production delivery rows remain honest outbox states until issue #20 selects and verifies an external transport. Realtime remains disabled until issue #10 completes the Vercel WebSocket production probe.
