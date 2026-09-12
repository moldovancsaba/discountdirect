# Operations

## Local setup

Use Node 24 and pnpm 10.30.3. Copy `.env.example` to `.env.local` only if the local file does not already exist. Set `MONGODB_URI`; optionally set `MONGODB_DB`. Keep the existing `OPERATIONS_TOKEN` to access the operator dashboard, or generate a random key of at least 32 characters. Set `CRON_SECRET` before enabling Vercel Cron. Do not paste credentials into source or issue comments.

```
pnpm install --frozen-lockfile
pnpm check
pnpm db:check
pnpm db:restore-drill
pnpm dev
```

Visit `/admin`, enter the `OPERATIONS_TOKEN` from the local env file, and confirm Atlas status. `db:check` runs a read-only ping and disconnects. Build succeeds without secrets; missing or invalid runtime configuration fails closed.

## Verification

`pnpm check` runs Next.js and GDS lint rules, strict typechecking, authentication/session tests, e-mail adapter security tests, GDS manifest validation, strict GDS consumer compliance and the production build. After the build, `pnpm test:auth-integration` verifies the account flow in a temporary isolated Atlas database and removes its collections. `pnpm test:email-integration` verifies the Resend-gated delivery worker and signed inbound webhook against a disposable Atlas database and local fake Resend endpoint; it does not contact real recipients. Start the production server with `pnpm start`, then run `pnpm test:smoke` separately. This checks public routes, protected dashboard rendering, unauthorized readiness, 404 behavior and authenticated Atlas readiness without modifying records. For production use `SMOKE_BASE_URL=https://discountdirect.vercel.app pnpm test:smoke` with the production operator token configured locally. Release review also runs `pnpm test:quality-release`; it checks the production public shell, sign-in labels, operator gate, protected-route redirects, readiness and cron authorization without creating customer data. Realtime release review runs `pnpm test:realtime-production -- --base-url=https://discountdirect.vercel.app --require-distinct-runtime` with production environment values stored locally.

Browser verification covers desktop/mobile layouts, navigation, login, logout, theme switching and no horizontal overflow at 390px. The GDS manifest and strict source scan are release gates; the shipped Hungarian locale is selected at the root provider.

## Deployment

The repository's `vercel.json` selects Next.js with frozen-lockfile installation, runs `/api/cron/automations` every 30 minutes, runs `/api/cron/deliveries` every 15 minutes and gives `api/socket-io.ts` a 300-second function duration. Vercel is already linked to `narimato/discountdirect`. Configure `MONGODB_URI`, `MONGODB_DB`, `OPERATIONS_TOKEN`, `CRON_SECRET` and `REALTIME_ENABLED` in Production; repeat for Preview when enabling protected preview access. Set `REALTIME_ENABLED=false` to disable sockets without disabling durable conversations. E-mail delivery additionally requires the Resend variables listed in [email-delivery-provider-evidence-2026-09-12.md](email-delivery-provider-evidence-2026-09-12.md); do not set `EMAIL_DELIVERY_PROVIDER=resend` until sender DNS, webhook signing and staged-recipient rollout are approved. GDS 6.7.0 is pinned to official public release assets, so CI and deployment do not expose `GITHUB_TOKEN`; the configured token can be retained for the future return to authenticated registry delivery.

1. Run all checks and inspect `git diff --check`.
2. Commit and push the reviewed release to main.
3. Run `vercel deploy --prod --scope narimato` from the linked repository.
4. Verify the deployment is Ready, run production smoke checks, inspect the browser and authenticate the dashboard.
5. Attach deployment and commit evidence to GitHub issue #1. Do not close issues with remaining acceptance requirements.

## Recovery

- Production alert thresholds, owners and channels are listed in `docs/operations-alerts.md`. The manual monitor command is `pnpm ops:monitor`; it checks the production alias without printing secrets.
- Atlas unavailable: public liveness remains available; protected readiness returns 503 and the dashboard shows no connection. Check the Vercel URI, database permissions and Atlas network access. Correct the setting and redeploy; retry the dashboard. Do not log the URI or raw driver errors.
- Operator access unavailable: check OPERATIONS_TOKEN is configured and at least 32 characters. Rotation immediately invalidates old cookies on the new deployment; sign in using the new key.
- Automation or delivery cron unauthorized: check `CRON_SECRET` is configured and that the cron request includes it as a bearer token.
- Realtime degraded: set `REALTIME_ENABLED=false` in Vercel Production and redeploy, then use durable HTTP conversations while investigating Vercel WebSocket status, `api/socket-io.ts`, Atlas change streams and production logs.
- Delivery shows `TRANSPORT_NOT_CONFIGURED` or `EMAIL_TRANSPORT_CONFIGURATION_INCOMPLETE`: this is expected until Resend/DNS/Vercel provider setup is complete. Do not mark these rows sent manually.
- UI/HTTP regression: use Vercel Instant Rollback to a previously verified deployment in the project deployment history; then revert the offending commit on GitHub and deploy again. Authentication indexes and empty additive collections may remain after rollback; release 0.3.0 does not alter business records. Never choose an unverified future deployment.
- Performance: the displayed duration covers this request's connection plus ping, not application-wide latency. No user-presence or historical performance metrics are asserted yet.
