# Application architecture — 1.5.0

Next.js 15.5.21 App Router owns the frontend and HTTP backend, with React 19.2.8, TypeScript 6.0.3, Node 24 and Mongoose 9.9.5. This matches the GDS 6.7.0 Next.js reference consumer while retaining current security patches. The existing Vercel project is `narimato/discountdirect` and GitHub main is the release branch.

## Implemented routes

- `/`: Hungarian overview; upcoming product capabilities are explicitly labeled as planned.
- `/admin`: protected General Dashboard with an on-demand Atlas ping, response duration, release version, and an explicit unavailable/not-yet-instrumented user-presence state.
- `/api/health/live`: public process liveness; `{status,service,version}`; does not call Atlas.
- `/api/health/ready`: operator Bearer token required; returns 401 before any database access when unauthorized, 200 for a successful ping, 503 when the database cannot be reached. Responses are not cached. Presence is `{status:"not_instrumented",activeUsers:null}`, never an invented zero.
- `/buyer/{sellerSlug}/preferences`: buyer-owned, seller-scoped channel consent and privacy requests.
- `/seller/{sellerSlug}/privacy`: seller-member workflow for processing access, restriction and erasure requests.

## Database connection

Only server code imports the shared Mongoose helper. The URI is read at request time, allowing clean builds without database credentials. Concurrent first requests share a pending connection. Failed connection attempts clear the pending promise, allowing subsequent requests to recover. Pool size is capped at five per function instance; selection/connect/socket and ping deadlines are bounded at five seconds. Automatic index creation and command buffering are disabled. This release does not create business collections, insert demo records or run migrations.

Use `MONGODB_DB` to select a database, default `discountdirect`. Each future tenant-scoped collection and index belongs to its domain issue. Atlas backup/access-policy acceptance remains in issue #2.

## Temporary operator access

`OPERATIONS_TOKEN` is a generated, high-entropy, server-only break-glass key, minimum 32 characters. Next.js Server Actions handle form origin validation. Token comparison uses fixed-size SHA-256 digests with constant-time comparison. A successful login sets a signed HttpOnly, SameSite=Strict cookie, Secure in production, expiring after one hour. The raw operator key is never stored in the cookie or sent in HTML. Rotating the environment key invalidates existing break-glass sessions. Provisioned operator users and approved DoneIsBetter SSO admins can also access `/admin`; those sessions are Atlas-backed and revocable.

## Identity access slice

Release 0.3.0 adds Atlas-backed users, sellers, memberships, buyer relationships, activation/recovery tokens, sessions and durable login rate limits. Passwords use versioned Node scrypt parameters and a random salt. Browser sessions store only a random opaque token; Atlas stores its SHA-256 hash. Sessions have a 30-minute idle deadline and a 12-hour absolute deadline. Activation and recovery rotate `authVersion` and revoke all existing sessions in one transaction. Release 1.4.1 adds audited operator revocation for user sessions, user disable, seller memberships and buyer relationships; revocation increments the affected user's `authVersion` so protected HTTP requests and reconnects fail closed.

Release 0.4.0 adds the same DoneIsBetter OAuth/OIDC integration contract used by the deli.africa sibling project. A signed, HttpOnly, SameSite Lax flow cookie carries the ten-minute state, nonce, PKCE verifier and safe return path. The backend exchanges the authorization code, loads user info and records the client-specific permission state. SSO users are synchronized by stable provider subject, with verified local roles, tenant memberships and buyer relationships remaining authoritative. An approved SSO `admin` role grants the existing operator identity path.

Release 0.5.0 adds seller-scoped `Product`, `ProductRevision` and `ImportBatch` collections. Product writes use optimistic versions and seller+SKU uniqueness. Import previews record their checksum and expected versions; apply uses an Atlas transaction so partial or stale batches cannot silently overwrite newer edits.

Release 0.6.0 adds `Customer`, `Purchase` and `PurchaseImportBatch`. Customer identity and order-line uniqueness include the seller ID. Purchase imports are validated and previewed before an Atlas transaction applies them. Original purchase rows remain durable: refunds and corrections change status with an optimistic version and reason, while active-spend totals include only purchased rows. Buyer history requires an active relationship and matches the authenticated account's normalized email inside the same seller scope.

Release 0.8.0 adds `ChannelPreference`, append-only `ConsentEvent`, `PrivacyRequest` and expiring `PrivacyExport`. Preferences are unique by seller, buyer, channel and purpose. An opt-in or later withdrawal records the server-owned notice version. Repeating an unchanged preference does not invent another consent event. One open request of each type is allowed per seller and buyer; an indexed open key makes concurrent retries converge on the same request. Seller members can move requests through requested, processing, completed and retryable failed states.

Completing restriction or erasure withdraws every active marketing channel in the same transaction. Erasure removes the seller-side customer name, e-mail and source identifier, revokes that seller relationship and preserves purchase rows required as financial evidence. Completing an access request creates a seller-scoped JSON snapshot that only the requesting buyer can download and that Atlas deletes after seven days.

Release 0.9.0 adds immutable `RecommendationPreview` snapshots. The versioned rule engine considers only active in-stock seller products, active purchase rows, catalog compatibility, repeat age and same-category evidence. It applies fixed rule precedence and product-ID tie-breaking. A preview is blocked without an active buyer relationship, active customer state and consent for the selected channel. The input hash makes identical retries return the same stored snapshot; each result retains product version, price, rule, explanation and purchase evidence IDs.

Release 1.0.0 adds durable `Conversation` and `ConversationEvent` collections. Every conversation is unique to a seller and buyer, with an optional linked customer record, unread counters and a neutral zero pending-offer count. Opening a conversation records an activity event. Messages have a sender-scoped client request ID that makes retried sends idempotent, and their ordered timeline supports opaque cursor pagination. Seller membership and buyer relationship checks are applied for every inbox, timeline and message mutation. No attachment storage, notifications or Socket.IO transport exists yet.

Release 1.1.0 adds a durable Atlas `RealtimeEvent` log and expiring `ConversationPresence` records. Every message transaction creates one replayable `message.created` event after its conversation version increases; retries create neither a second message nor a second realtime event. The Vercel Socket.IO endpoint accepts only WebSocket transport, verifies the opaque session at handshake, reauthorizes each room and fanouts the Atlas change stream to local authorized rooms. The browser always reloads its durable HTTP state after a realtime event. Release 1.5.0 adds the production synthetic probe for Vercel WebSockets, Atlas change-stream fanout, unauthorized subscription denial and reconnect replay. `REALTIME_ENABLED` remains the rollback switch and HTTP timelines remain authoritative if sockets degrade.

Release 1.2.0 adds `Offer` and append-only `OfferEvent` records. Sellers can derive an offer only from a stored eligible recommendation under the selected channel's current consent, active relationship and customer state. Product identity, original price, explanation and purchase evidence are snapshots; the only accepted creation values are a bounded discount and expiry. Buyer decisions use a pending-version compare-and-set inside an Atlas transaction. A decision changes the linked conversation's pending-offer count and records an `offer.updated` realtime event, while accepting explicitly remains a decision/reservation intent rather than payment or fulfillment.

Release 1.3.0 adds immutable flash `Campaign` rows, per-offer `CampaignReservation` audit rows and one shared seller/product `CampaignInventoryBalance`. A launch selects the latest eligible preview per currently consented buyer, snapshots product pricing and reasons, and creates one campaign offer per selected buyer in the same transaction. A buyer claim atomically increments the shared balance below current catalog stock, decrements the campaign cap and creates the reservation before accepting the offer. Cancellation releases each outstanding reservation once. Campaigns are an in-app offer and reservation capability only; they do not synchronize external stock or perform delivery, payment or fulfillment.

Release 1.4.0 adds durable `DeliveryOutbox` and `DeliveryEvent` rows for personal offers, flash campaigns, automated lists and printable letters. The outbox records consent suppression and unsupported transport explicitly instead of claiming e-mail or postal delivery. Issue #20 adds provider-gated Resend dispatch with idempotency keys, provider message IDs, signed unsubscribe links, `/api/cron/deliveries`, `/api/email/inbound`, `DeliverySuppression` and `DeliveryWebhookEvent`. Webhook processing verifies the raw Svix signature, timestamp window and provider event idempotency before mapping inbound replies to an existing conversation or recording bounce/complaint/provider suppressions. Recurring `OfferAutomation` rows create auditable `OfferAutomationRun` records and buyer-visible `OfferList` snapshots through the same recommendation evidence rules. Accepted offers issue exactly one `RedemptionCoupon`, and seller confirmation changes that code to redeemed in a transaction. Privacy restriction and erasure cancel queued/retryable delivery work.

`GET /api/me` resolves scopes on the server. Seller routes require an active membership for the exact seller slug. Buyer routes require an active relationship for the exact seller slug. Client-supplied roles and seller identifiers never grant access. Cookie-authenticated API mutations compare the request Origin with the effective Vercel host. Login attempts use an Atlas collection, so the five-attempt/15-minute limit applies across function instances.

The account UI supports sign-in, activation, scoped workspace selection and logout. There is no public signup or working email recovery claim. Manual provisioning and recovery are documented in [authentication.md](authentication.md). Administrator MFA and migration away from the emergency operations key remain release gates in issue #4.

## Interface decision

Release 0.7.0 uses SovereignSquad GDS 6.7.0 as the single interface authority. `GdsProvider` resolves the native `mint` preset once at the application root, provides Hungarian messages, and owns light/dark scheme state. The shipped GDS stylesheet is imported once. A client-boundary module re-exports the unchanged GDS client primitives because the published server bundle evaluates a client-only Mantine theme helper during Next.js page collection. Application routes otherwise remain server components for data access and authorization. The routes use governed shell, navigation, content, form, table, icon and state primitives; application code imports neither Mantine nor Tabler directly.

Local CSS only composes layout around GDS variables for color, typography, spacing, radius, control sizing and motion. The strict adoption manifest has no adapters or exceptions, and `pnpm check` enforces GDS consumer compliance plus the GDS ESLint configuration. Because GitHub Packages tarball delivery still returns the organization billing-limit error, dependencies use the official 6.7.0 temporary release bundle described by the GDS release itself.

## Toolchain

Use pnpm 10.30.3 and the committed lockfile. TypeScript 6.0 and ESLint 9 match the current Next.js ESLint plugin peer ranges; ESLint 9 has an upstream deprecation notice. Track a compatible tooling update rather than forcing incompatible ESLint 10/TypeScript 7 peers. Install scripts are permitted only for `sharp` and `unrs-resolver`.

## Remaining product work

Public registration, automated legal-deadline escalation and production real outbound e-mail/inbound replies are not enabled. Issue #20 now has the Resend adapter code and runbook, but it remains open until sender-domain DNS, Vercel provider variables and controlled production round-trip evidence are attached. No customer data has been seeded. The break-glass operator token remains documented as a compensating control for outages; normal operator users are individually revocable.
