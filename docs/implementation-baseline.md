# Implementation baseline inventory

Verified on 2026-09-18 against the local implementation repository at
`/Users/Shared/Projects/discountdirect`, through `main` commit `0eb5d55`
(`feat: measure campaign holdout lift`). This file is the DD-000 baseline artifact: keep it in sync whenever the
runtime stack, deployment shape, domain models, route surface or provider
contracts materially change.

## Stack

| Layer | Verified implementation |
| --- | --- |
| Runtime | Node `24.x`, pnpm `10.30.3` |
| App and HTTP backend | Next.js `15.5.21` App Router, React `19.2.8`, TypeScript `6.0.3` |
| Hosting | Vercel project `narimato/discountdirect`; production alias `https://discountdirect.vercel.app` |
| Database | MongoDB Atlas through Mongoose `9.9.5`; shared connection helper in `src/lib/database-core.ts` |
| Interface | SovereignSquad GDS `6.7.0`, Mantine packages under the GDS layer, Hungarian locale |
| Authentication | DoneIsBetter OAuth/OIDC SSO only; local password/activation endpoints fail closed with `SSO_ONLY` |
| Realtime | Socket.IO endpoint on Vercel plus durable Atlas `RealtimeEvent` replay and HTTP fallback |
| Jobs | Vercel Cron invokes `/api/cron/automations` every 30 minutes and `/api/cron/deliveries` every 15 minutes |
| E-mail | Resend adapter for outbound mail, signed inbound replies, suppressions and unsubscribe handling |
| Accelerators and artifacts | Upstash Redis client/key-policy foundations exist and frequency-cap counters are wired with MongoDB as authority; general rate limits, flash counters and locks remain planned. Vercel Blob has a private-key and signed-read foundation but is not yet wired to product artifacts. No separate reporting projection exists. |

## Deployment and environment

`vercel.json` declares the Next.js framework, frozen-lockfile install, `pnpm build`,
two cron paths and a 300-second `api/socket-io.ts` function budget. The required or
recognized environment variables are:

| Area | Variables |
| --- | --- |
| Database | `MONGODB_URI`, `MONGODB_DB` |
| App/runtime | `APP_URL`, `REALTIME_ENABLED` |
| Redis | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| Blob | `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID`, or Vercel OIDC with `BLOB_STORE_ID` |
| SSO | `SSO_CLIENT_ID`, `SSO_CLIENT_SECRET`, `SSO_ORIGIN`, `SSO_REDIRECT1_URI`, `SSO_REDIRECT2_URI` |
| Operations | `OPERATIONS_TOKEN`, `CRON_SECRET` |
| E-mail | `EMAIL_DELIVERY_PROVIDER`, `EMAIL_PUBLIC_BASE_URL`, `EMAIL_STAGED_RECIPIENTS`, `EMAIL_UNSUBSCRIBE_SECRET`, `RESEND_API_KEY`, `RESEND_API_BASE_URL`, `RESEND_FROM`, `RESEND_REPLY_DOMAIN`, `RESEND_WEBHOOK_SECRET` |
| Package registry | `GITHUB_TOKEN` remains available for registry delivery but the current GDS dependency path uses public release assets |

## Domain modules and collections

| Module | Collections / durable records |
| --- | --- |
| `src/auth` | `users`, `sellers`, `memberships`, `buyer_relationships`, `sessions`, `access_tokens`, `login_rate_limits`, `auth_audit_events` |
| `src/catalog` | `products`, `product_revisions`, `import_batches` |
| `src/purchases` | `customers`, `purchases`, `purchase_import_batches` |
| `src/privacy` | `channel_preferences`, `consent_events`, `privacy_requests`, `privacy_exports` |
| `src/recommendations` | `recommendation_previews` |
| `src/messaging` | `conversations`, `conversation_events` |
| `src/realtime` | `realtime_events`, `conversation_presence` |
| `src/offers` | `offers`, `offer_events` |
| `src/campaigns` | `campaigns`, `campaign_previews`, `campaign_reservations`, `campaign_inventory_balances` |
| `src/delivery` | `delivery_outbox`, `delivery_events`, `delivery_suppressions`, `delivery_webhook_events` |
| `src/automations` | `offer_automations`, `offer_automation_previews`, `offer_automation_runs`, `offer_lists` |
| `src/redemptions` | `redemption_coupons`, `redemption_events` |
| `src/connectors` | `connector_installations`, `connector_runs` |
| `src/handoff` | `offer_handoffs` |

The implementation uses explicit seller and buyer access checks in each domain
service. The DD-002 tenant guard in `src/lib/tenant-core.ts` is applied to every
seller-owned business model family: catalog, purchase ledger, privacy,
recommendations, messaging, offers, campaigns, delivery, automation, realtime
and redemption. The guard injects the active seller context when present,
accepts explicit `sellerId` constraints during the compatibility rollout,
refuses unscoped guarded-model access and requires named bypasses for intentional
cron, provider-webhook and operator reporting flows. Memberships and buyer
relationships remain explicit authorization scope records rather than guarded
business data.

## Route and surface inventory

Human-facing App Router surfaces:

- Public: `/`, `/experience`, `/sign-in`, `/auth/callback`, `/activate`
- Account/operator: `/account`, `/admin`
- Buyer: `/buyer`, `/buyer/{sellerSlug}`, `/buyer/{sellerSlug}/preferences`,
  `/buyer/conversations`, `/buyer/conversations/{conversationId}`, `/buyer/offers`,
  `/buyer/lists`, `/buyer/lists/{listId}`, `/buyer/letters/{listId}`,
  `/buyer/redemptions`
- Seller: `/seller/{sellerSlug}`, `/seller/{sellerSlug}/customers`,
  `/seller/{sellerSlug}/conversations`, `/seller/{sellerSlug}/campaigns`,
  `/seller/{sellerSlug}/automations`, `/seller/{sellerSlug}/deliveries`,
  `/seller/{sellerSlug}/privacy`, `/seller/{sellerSlug}/redemptions`

Route Handler groups:

- Auth/session: `/api/auth/*`, `/api/oauth/callback`, `/api/me`
- Health/ops: `/api/health/live`, `/api/health/ready`
- Seller APIs: products, product imports, purchase imports, customers,
  customer history, recommendations, conversations, offers, campaigns,
  automations, deliveries, privacy requests and redemptions under
  `/api/sellers/{sellerSlug}/...`
- Buyer APIs: preferences, privacy requests/export, lists and redemptions under
  `/api/buyer/...`
- Conversations/offers: `/api/conversations`, conversation messages/realtime
  replay and `/api/offers/{offerId}/respond`
- Jobs/providers: `/api/cron/automations`, `/api/cron/deliveries`,
  `/api/email/inbound`, `/api/email/unsubscribe`

Server Actions exist for account, admin, buyer preferences/offers, conversation
messages/offers and seller workflows for customers, campaigns, automations,
privacy and redemptions.

## Verified capability baseline

- SSO-only account access, workspace selection, logout and audited operator
  revocation are implemented.
- Canonical authorization roles map membership owners to `seller_admin`, staff
  to `seller_agent`, active buyer relationships to `buyer` and approved
  operators to `platform_ops`. CI inventories every Route Handler and Server
  Action and fails when a surface has no declared access policy. Machine-token,
  public and hard SSO-only refusal endpoints remain separate from human roles.
- The idempotent DD-004 prototype loader seeds the isolated `elektrohome-demo`
  tenant with ElektroHome, Anna, Gábor and Réka, their 18 purchases, catalogue,
  recommendations, messages and offers. Development and Vercel Preview staging
  were verified with pending-offer counts `0 / 1 / 0`; production execution is
  refused by the loader.
- Tenant guards cover every seller-owned business model family. Buyer-wide
  reads derive their seller scope from active buyer relationships; global cron,
  provider-webhook and operator reporting flows use named bypasses.
- Seller product catalog, optimistic product imports, purchase imports and
  corrected/refunded purchase history are implemented.
- Buyer/seller privacy preferences, consent events, access exports,
  restriction and erasure workflows are implemented for e-mail and postal
  marketing channels.
- Recommendation previews are immutable, rule-versioned and grounded in
  purchase evidence.
- Conversations are durable, retry-safe and scoped by active seller/buyer
  relationships.
- Realtime is enabled as a convenience layer; durable HTTP state remains
  authoritative.
- Personal offers can be created from recommendation previews, accepted or
  declined by buyers, and recorded into conversation/realtime/event ledgers.
- Flash campaigns create campaign-scoped offers and in-app reservations against
  catalog stock and campaign caps.
- Offer automations create recurring buyer-visible offer lists through the same
  recommendation evidence rules.
- Delivery outbox rows, Resend outbound sends, signed inbound replies,
  unsubscribe links, bounce/complaint suppressions and delivery cron processing
  are implemented.
- Accepted offers issue one redemption coupon, and seller confirmation redeems
  it transactionally.
- The HU market policy and strict seller settings registry apply SSOT defaults,
  reject unknown or out-of-range values, and expose owner-only updates through
  the protected seller settings endpoint.
- Every outbound marketing delivery passes one market-aware `may_send` decision
  covering relationship state, customer privacy state, objection or consent,
  prior-order soft opt-in and seller frequency caps. MongoDB sent history is
  authoritative and rebuilds missing Redis counters.
- Seller-buyer relationships persist deterministic `new`, `returning` or
  `loyal` segments with order count, lifetime HUF value and first/last order
  dates. Purchase ingest and corrections recalculate the same versioned rule.
- Personal offers and flash campaigns enforce seller pricing server-side in
  both configured modes: approved discount steps or bounded guardrails. Global,
  retained-price and per-segment maxima are applied before price calculation.
- Personal offers and flash campaigns derive a frozen 30-day comparison price
  from catalog revisions, including the price effective when the window began.
  The evidence window and matching revision versions remain attached to the
  commercial snapshot.
- Flash campaigns apply the configured deterministic pooled or per-campaign
  holdout before creating offers. Treatment and control membership are frozen
  in the campaign, and imported matching purchases produce comparable
  conversion-rate and measured-difference reporting without claiming causality
  for small samples.

## Known Release 1 deltas

These gaps are intentional inventory facts, not regressions:

- Upstash Redis has a client, key convention, TTL policy and Lua-script loader,
  and seller frequency caps are wired into outbound eligibility. General rate
  limits, flash counters and short-lived idempotency locks are not yet wired
  into the business flows or verified against staging Redis.
- Vercel Blob has a private artifact key convention, retention policy and signed
  read-url foundation. Privacy exports are still database-backed and postal/PDF
  artifact persistence is not yet wired into business flows or verified against
  staging Blob.
- Tenant guard compatibility rollout is complete across seller-owned business
  models. Moving all request entry points from explicit `sellerId` constraints
  to mandatory async-local seller context remains a later hardening step.
- The provider-neutral connector contract and Shoprenter/UNAS adapters implement
  live connection tests and bounded product, order and stock reads. The owner UI
  stores only a strict environment-variable reference and durable health state.
  Signed hand-off uses a recoverable processing lease and a validated same-origin
  product URL template. Automated provider cart creation, order write-back and
  stock webhooks remain open because neither published provider contract supplies
  the required browser-cart creation primitive.
- The richer SSOT offer states are not fully modeled locally: there is no
  `draft`, `sold_out`, `withdrawn` or `redeemed` offer status yet.
- Channel scope is still narrower than the SSOT: marketing preferences and
  offer creation currently focus on `email` and `postal`; in-app delivery exists
  as an outbox channel; newsletter, WhatsApp, RCS and marketplace inbox settings
  are not modeled.
- Incremental margin measurement, membership perks,
  birthday/back-in-stock/price-drop journeys and a separate reporting read
  model are not implemented.
- Postal partner submission, printed/posted statuses and PDF generation are not
  implemented.

## Verification commands

Use these commands after changing any baseline item:

```sh
pnpm check
pnpm test:auth-integration
pnpm test:email-integration
pnpm db:indexes
pnpm ops:monitor
```

Production realtime checks remain separate because they require production
environment values:

```sh
pnpm test:realtime-production -- --base-url=https://discountdirect.vercel.app --require-distinct-runtime
```

## Maintenance rule

Every change that affects stack, deployment, routes, environment variables,
domain models, provider contracts or durable business state must update this
inventory in the same pull request. If the external Calvus SSOT or technical
design disagrees with this file, this implementation inventory is the local
source of truth until the documents are reconciled.
