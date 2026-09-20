# Operations

## Private artifact recovery

- `artifacts.status=failed` means metadata exists but the immutable Blob write did not complete. Keep the row as evidence and regenerate with a new idempotency key after Blob health recovers.
- `artifacts.status=uploading` older than the worker timeout is an orphan candidate. Verify the Blob key before marking it failed; never overwrite an existing immutable object.
- Disable artifact-producing workflows to roll back creation. Existing `ready` objects remain readable only until `retentionUntil` and only through the authorized signed-read route.
- Alert on failed writes, stale uploading rows and deletion backlog without logging filenames, content, hashes tied to people, or signed URLs.

## Postal PDF recovery

- `print_snapshots.status=generating` is an active single-writer lease. A concurrent request fails closed and must not start a second render.
- `print_snapshots.status=failed` retains its failure evidence. Retrying atomically changes the snapshot back to `generating`, increments `generationAttempt` and writes through a new immutable artifact attempt key.
- `print_snapshots.status=ready` is idempotent: repeat requests return the existing snapshot and never regenerate or overwrite the PDF.
- Generation must be disabled if Blob is unavailable. Existing private artifacts remain governed by seller authorization and retention.
- The deployment bundle must contain the official Google Noto Sans regular and bold TTF files declared in `next.config.ts`; missing font files are a release-blocking build or runtime failure.

## Postal fulfillment recovery

- Disable the fulfillment mutation route to stop state changes while preserving PDF reads and all audit evidence.
- A version conflict means another agent advanced the row first. Refresh the queue; never force or move a row backwards.
- A repeated idempotency key returns the transition it already owns. Do not invent a replacement event for an already successful operation.
- `posted` records seller-confirmed handoff to a postal service only. There is no recipient-delivery confirmation until a verified provider event contract is implemented.

## Local setup

Use Node 24 and pnpm 10.30.3. Copy `.env.example` to `.env.local` only if the local file does not already exist. Set `MONGODB_URI`; optionally set `MONGODB_DB`. Configure the DoneIsBetter SSO variables for human login. Keep `OPERATIONS_TOKEN` only for readiness probes, and set `CRON_SECRET` before enabling Vercel Cron. Do not paste credentials into source or issue comments.

```
pnpm install --frozen-lockfile
pnpm check
pnpm db:check
pnpm db:restore-drill
pnpm dev
```

Visit `/admin`, sign in with a DoneIsBetter SSO account that has approved admin/operator permission, and confirm Atlas status. `db:check` runs a read-only ping and disconnects. Build succeeds without secrets; missing or invalid runtime configuration fails closed.

## Verification

`pnpm check` runs Next.js and GDS lint rules, strict typechecking, authentication/session tests, e-mail adapter security tests, GDS manifest validation, strict GDS consumer compliance and the production build. After the build, `pnpm test:auth-integration` verifies the account flow in a temporary isolated Atlas database and removes its collections. `pnpm test:email-integration` verifies the Resend-gated delivery worker and signed inbound webhook against a disposable Atlas database and local fake Resend endpoint; it does not contact real recipients. Start the production server with `pnpm start`, then run `pnpm test:smoke` separately. This checks public routes, protected dashboard rendering, unauthorized readiness, 404 behavior and authenticated Atlas readiness without modifying records. For production use `SMOKE_BASE_URL=https://discountdirect.vercel.app pnpm test:smoke` with the production readiness token configured locally. Release review also runs `pnpm test:quality-release`; it checks the production public shell, sign-in labels, operator gate, protected-route redirects, readiness and cron authorization without creating customer data. Realtime release review runs `pnpm test:realtime-production -- --base-url=https://discountdirect.vercel.app --require-distinct-runtime` with production environment values stored locally.

Browser verification covers desktop/mobile layouts, navigation, login, logout, theme switching and no horizontal overflow at 390px. The GDS manifest and strict source scan are release gates; the shipped Hungarian locale is selected at the root provider.

## Deployment

The repository's `vercel.json` selects Next.js with frozen-lockfile installation, runs `/api/cron/automations` every 30 minutes, runs `/api/cron/deliveries` every 15 minutes and gives `api/socket-io.ts` a 300-second function duration. Vercel is already linked to `narimato/discountdirect`. Configure `MONGODB_URI`, `MONGODB_DB`, SSO variables, `OPERATIONS_TOKEN`, `CRON_SECRET` and `REALTIME_ENABLED` in Production; repeat for Preview when enabling protected preview access. Set `REALTIME_ENABLED=false` to disable sockets without disabling durable conversations. Frequency-cap acceleration requires `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; MongoDB sent-delivery history remains authoritative if Redis is unavailable or a key expires. Blob-backed private artifacts require `BLOB_READ_WRITE_TOKEN` or Vercel OIDC with `BLOB_STORE_ID` when those artifact flows are enabled. E-mail delivery additionally requires the Resend variables listed in [email-delivery-provider-evidence-2026-09-12.md](email-delivery-provider-evidence-2026-09-12.md); Production uses `EMAIL_DELIVERY_PROVIDER=resend` with staged-recipient controls. GDS 6.7.0 is pinned to official public release assets, so package installation does not require `GITHUB_TOKEN`.

1. Run all checks and inspect `git diff --check`.
2. Commit and push the reviewed release to main.
3. Run `vercel deploy --prod --scope narimato` from the linked repository.
4. Verify the deployment is Ready, run production smoke checks, inspect the browser and authenticate the dashboard.
5. Attach deployment and commit evidence to the relevant tracked delivery item. Do not close work with remaining acceptance requirements.

## Recovery

- Production alert thresholds, owners and channels are listed in `docs/operations-alerts.md`. The manual monitor command is `pnpm ops:monitor`; it checks the production alias without printing secrets.
- Atlas unavailable: public liveness remains available; protected readiness returns 503 and the dashboard shows no connection. Check the Vercel URI, database permissions and Atlas network access. Correct the setting and redeploy; retry the dashboard. Do not log the URI or raw driver errors.
- Operator access unavailable: check the user's DoneIsBetter app permission is approved and has `admin` or `operator` role. Also verify `SSO_CLIENT_ID`, `SSO_CLIENT_SECRET`, `SSO_REDIRECT1_URI` and `SSO_REDIRECT2_URI` are configured.
- Automation or delivery cron unauthorized: check `CRON_SECRET` is configured and that the cron request includes it as a bearer token.
- Realtime degraded: set `REALTIME_ENABLED=false` in Vercel Production and redeploy, then use durable HTTP conversations while investigating Vercel WebSocket status, `api/socket-io.ts`, Atlas change streams and production logs.
- Delivery shows `TRANSPORT_NOT_CONFIGURED` or `EMAIL_TRANSPORT_CONFIGURATION_INCOMPLETE`: verify Resend/Vercel provider variables, staged-recipient configuration and the latest deployment. Do not mark these rows sent manually.
- UI/HTTP regression: use Vercel Instant Rollback to a previously verified deployment in the project deployment history; then revert the offending commit on GitHub and deploy again. Authentication indexes and empty additive collections may remain after rollback; release 0.3.0 does not alter business records. Never choose an unverified future deployment.
- Performance: the displayed duration covers this request's connection plus ping, not application-wide latency. No user-presence or historical performance metrics are asserted yet.
## Prototype fixtures

Load the original DiscountDirect acceptance fixture into an isolated development
or staging database with:

```bash
pnpm fixtures:prototype -- --target=development --owner-email=your-sso-email@example.com
```

Use `--target=staging` with the Vercel Preview environment. The loader is
idempotent, uses the dedicated `elektrohome-demo` seller slug and refuses a
production runtime. Its final JSON summary must report Kiss Anna, Szabó Gábor
and Nagy Réka with 9, 7 and 2 purchases and 0, 1 and 0 pending offers.
