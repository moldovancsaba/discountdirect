# Implementation baseline inventory

Verified on 2026-09-17 against the local implementation repository at
`/Users/Shared/Projects/discountdirect`, with `main` at `4ca170d`
(`fix: clean up production workspace ui (#24)`) before this inventory document was
added. This file is the DD-000 baseline artifact: keep it in sync whenever the
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
| Current storage gaps | Upstash Redis and Vercel Blob client/key-policy foundations exist, but staging/production stores are not configured or wired into business flows yet; no separate reporting projection yet |

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

The implementation uses explicit seller and buyer access checks in each domain
service. A DD-002 tenant guard foundation now exists in `src/lib/tenant-core.ts`
and is applied to catalog, purchase-ledger, privacy and recommendation-preview
models. The guard injects the active seller context when present, refuses
unscoped guarded-model access, and requires named bypasses for intentional
cross-seller maintenance checks. Messaging, offers, campaigns, delivery,
automation, realtime and redemption models still rely on explicit service-level
seller checks until the remaining DD-002 strict rollout wraps those flows.

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
- Tenant guard helpers and first guarded model families are implemented for
  catalog, purchase-ledger, privacy and recommendation-preview records.
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

## Known Release 1 deltas

These gaps are intentional inventory facts, not regressions:

- Upstash Redis has a client, key convention, TTL policy and Lua-script loader
  foundation. Frequency caps, rate limits, flash counters and short-lived
  idempotency locks are not yet wired into the business flows or verified
  against staging Redis.
- Vercel Blob has a private artifact key convention, retention policy and signed
  read-url foundation. Privacy exports are still database-backed and postal/PDF
  artifact persistence is not yet wired into business flows or verified against
  staging Blob.
- Tenant guard rollout is partial: catalog, purchase-ledger, privacy and
  recommendation-preview models are guarded, while messaging, offers, campaigns,
  delivery, automation, realtime, redemption and auth relationship models are
  pending strict tenant-context wrapping.
- The e-commerce handoff/write-back path is not implemented: no Shoprenter,
  UNAS, WooCommerce or Shopify connector, cart token, checkout URL, order
  write-back or stock webhook.
- The richer SSOT offer states are not fully modeled locally: there is no
  `draft`, `sold_out`, `withdrawn` or `redeemed` offer status yet.
- Channel scope is still narrower than the SSOT: marketing preferences and
  offer creation currently focus on `email` and `postal`; in-app delivery exists
  as an outbox channel; newsletter, WhatsApp, RCS and marketplace inbox settings
  are not modeled.
- Holdout groups, incremental margin measurement, frequency caps, 30-day
  reference-price evidence, membership perks, birthday/back-in-stock/price-drop
  journeys and a reporting read model are not implemented.
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
