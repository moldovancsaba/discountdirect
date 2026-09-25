# Operations

## Rule-template recovery

- A seller can return to the active predefined template from the settings page. This writes a new optimistic seller-settings version and audit event; it does not delete the former override evidence.
- If an advanced override produces an unacceptable result, disable advanced use by reverting affected sellers to predefined mode. Existing effective snapshots remain available for investigation.
- Published template versions are immutable. Publish a corrected higher version rather than editing a historical record. Only inactive versions may be retired.
- A stale seller-settings update returns a conflict and must be retried after reloading current provenance. Never bypass the version check.
- To verify recovery, preview the proposed resolution first, confirm its legal locks and changed paths, then save it and compare the resulting resolution-event hash. Do not mutate unrelated sellers.

## Journey scheduler recovery

- Pause a journey definition before operational intervention. The pause transaction cancels only that definition's queued, processing and retryable delivery rows and retains delivery events.
- A claimed step has a two-minute lease. Do not force-unlock it; let the lease expire so another cron invocation can reclaim it safely.
- Later steps wait for earlier non-terminal steps. `WAITING_PREVIOUS_STEP` is a postponement, not a failed attempt.
- Retryable execution failures use 5, 30 and 120 minute delays. After three failed execution attempts the step is terminal and requires investigation before a new definition/enrollment is created.
- Run `GET /api/cron/journeys?limit=1` with the configured cron bearer token to verify one bounded claim. Never put the token in logs or issue comments.
- Resume the definition only after confirming its current version, pending step states and cancelled-delivery evidence. Historical versions and frozen snapshots are immutable.
- Birthday evaluation uses the tenant customer profile `birthDate` imported with the customer record; legacy definitions may still carry a bounded birthday value for compatibility. Missing birthday data is an explicit non-trigger, never a guessed date.
- Back-in-stock and price-drop definitions currently require a verified trigger request containing the normalized provider observation. Do not claim automatic provider enrollment until the connector event-ingestion contract is enabled and its idempotency/replay evidence is available.

## Checkout hand-off recovery

- Set `HANDOFF_ENABLED=false` and redeploy to stop issuing and consuming checkout hand-offs without changing accepted offers.
- With the flag disabled, run `pnpm handoff:revoke` in the correctly linked environment to revoke every unconsumed `issued` or `processing` token. The command refuses to run while the feature is enabled.
- A consumed token is terminal and cannot be replayed. A two-minute processing lease permits recovery after a worker interruption; retryable connector failures return the token to `issued` until its original expiry.
- The buyer relationship and accepted offer are revalidated at consumption. Revoked relationships fail closed, and the public recovery screen contains no buyer, seller, price or provider details.
- Re-enable the feature only after connector health and the production hand-off recovery states have been verified.

## Commerce connector recovery

- Each manual sync invocation processes one provider page with at most 100 normalized records. The run owns a two-minute lease and advances its capability-specific cursor only in the same transaction that stores records and marks the run successful.
- Provider transport retries twice with bounded exponential backoff and jitter. A failed run may be reclaimed twice after 1 and 5 minutes; the third failed attempt is terminal and retains its safe error code.
- Reusing an idempotency key returns the successful run. A replacement deployment may reclaim an expired running lease; it must not create a second run or advance the cursor twice.
- Disable the installation to stop tests, synchronization and new checkout hand-offs. Durable connector records and run evidence remain retained for investigation.
- `AUTH` and `CONFIGURATION` require credential/configuration repair. Transient timeout, rate-limit and provider failures mark the installation degraded. Test the corrected installation before resuming synchronization.
- Never rewind a cursor in production without documenting the provider range and using a new idempotency key. Record upserts are provider-ID based, but a rewind can still increase provider load.
- Order write-back is an explicit connector capability. Until a provider adapter has a documented endpoint, required scope and sandbox evidence, it returns `CAPABILITY_UNSUPPORTED`; this is terminal, must not be retried, and must never be presented as a successful provider update.
- Shoprenter, postal and Resend webhook ingress is rate-limited per source address (120 requests per minute) when Redis is configured. Redis-unavailable mode accepts the request and relies on signature, replay and durable idempotency checks; rate-limit rejection is an explicit `429 RATE_LIMITED` response.
- Accepted flash offers record a Redis campaign counter with expiry-based recovery retention after the MongoDB transaction commits. MongoDB reservation state remains authoritative; Redis loss only removes the acceleration counter and never changes acceptance or stock decisions.

## Private artifact recovery

The authenticated readiness endpoint reports `database`, `artifacts`, and `redis`
health. A database-ready response with `artifacts.connected=false` means normal
application data is available but Blob-backed generation/download must remain
disabled until the reported Blob reason is resolved.

Redis is an acceleration layer: `redis.connected=false` does not invalidate
MongoDB-backed delivery history or authorization, but rate limits and counters
must operate through their bounded fallback paths until Redis recovers.

- Automation, journey, and delivery/postal cron routes use a namespaced 60-second Redis lock. A configured lock suppresses overlapping runs with `REDIS_LOCK_BUSY`; it never replaces the MongoDB claim/lease safeguards.
- When Redis is unavailable, those cron routes continue through MongoDB transactions and leases. Treat this as degraded operation, not as proof that distributed overlap protection is active.
- Verify recovery with `pnpm ops:monitor`, then run one bounded authorized cron request. Do not flush keys outside the `camp:`, `cap:`, `lock:`, and `rate:` namespaces.

- `artifacts.status=failed` means metadata exists but the Blob write did not complete. Keep the row as evidence and retry the same idempotency key after Blob health recovers; the content hash must match.
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

## Postal provider recovery

- Leave `POSTAL_DELIVERY_PROVIDER` empty to disable all provider claims while preserving manual seller fulfillment.
- The HTTP adapter requires an HTTPS endpoint and public base URL, a server-only bearer token and a webhook secret of at least 32 characters. Never expose values in logs or issue comments.
- `retryable_failed` rows are reclaimed by the delivery cron after bounded exponential delay. `failed`, `cancelled` and `delivered` are terminal.
- Cancellation is accepted only before provider acceptance (`queued` or `retryable_failed`). A timeout after provider acceptance is resolved by idempotent retry or signed callback, never by creating another submission.
- Callback events are unique by provider and event ID. Replays return their prior action without mutating the submission.

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

## Shoprenter connector recovery

- Create a shop-specific OAuth client with `product.product:read`, `order.order:read`, `store.webhook:read` and `store.webhook:write`. Store its JSON credentials only in the environment variable referenced by the installation.
- Set a unique `SHOPRENTER_WEBHOOK_SECRET` of at least 32 characters. Configure `order_confirm` and `order_status_change` callbacks to `https://discountdirect.vercel.app/api/connectors/shoprenter/events/{sellerSlug}?secret={SHOPRENTER_WEBHOOK_SECRET}`. Shoprenter does not document a native signing header for store webhooks; protect the callback URL as a credential and rotate it after any exposure.
- On `AUTH`, restore or replace the OAuth client and retest the installation. On `RATE_LIMIT`, keep the same run idempotency key and wait for the shown retry time. On malformed currency, shop mismatch or payload failure, leave the event rejected and correct the provider configuration; do not rewrite evidence.
- To stop ingestion, disable the installation and remove the two Shoprenter webhook registrations. Existing normalized records, run history and payload hashes remain available for recovery.

## Verification

`pnpm check` runs Next.js and GDS lint rules, strict typechecking, authentication/session tests, e-mail adapter security tests, GDS manifest validation, strict GDS consumer compliance and the production build. After the build, `pnpm test:auth-integration` verifies the account flow in a temporary isolated Atlas database and removes its collections. `pnpm test:email-integration` verifies the Resend-gated delivery worker and signed inbound webhook against a disposable Atlas database and local fake Resend endpoint; it does not contact real recipients. Start the production server with `pnpm start`, then run `pnpm test:smoke` separately. This checks public routes, protected dashboard rendering, unauthorized readiness, 404 behavior and authenticated Atlas readiness without modifying records. For production use `SMOKE_BASE_URL=https://discountdirect.vercel.app pnpm test:smoke` with the production readiness token configured locally. Release review also runs `pnpm test:quality-release`; it checks the production public shell, sign-in labels, operator gate, protected-route redirects, readiness and cron authorization without creating customer data. Realtime release review runs `pnpm test:realtime-production -- --base-url=https://discountdirect.vercel.app --require-distinct-runtime` with production environment values stored locally.

Browser verification covers desktop/mobile layouts, navigation, login, logout, theme switching and no horizontal overflow at 390px. The GDS manifest and strict source scan are release gates; the shipped Hungarian locale is selected at the root provider.

## Deployment

The repository's `vercel.json` selects Next.js with frozen-lockfile installation, runs `/api/cron/automations` every 30 minutes, `/api/cron/deliveries` every 15 minutes and `/api/cron/journeys` every 10 minutes, and gives `api/socket-io.ts` a 300-second function duration. Vercel is already linked to `narimato/discountdirect`. Configure `MONGODB_URI`, `MONGODB_DB`, SSO variables, `OPERATIONS_TOKEN`, `CRON_SECRET` and `REALTIME_ENABLED` in Production; repeat for Preview when enabling protected preview access. Set `REALTIME_ENABLED=false` to disable sockets without disabling durable conversations. Frequency-cap acceleration requires `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; MongoDB sent-delivery history remains authoritative if Redis is unavailable or a key expires. Blob-backed private artifacts require `BLOB_READ_WRITE_TOKEN` or Vercel OIDC with `BLOB_STORE_ID` when those artifact flows are enabled. E-mail delivery additionally requires the Resend variables listed in [email-delivery-provider-evidence-2026-09-12.md](email-delivery-provider-evidence-2026-09-12.md); Production uses `EMAIL_DELIVERY_PROVIDER=resend` with staged-recipient controls. GDS 6.7.0 is pinned to official public release assets, so package installation does not require `GITHUB_TOKEN`.

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
