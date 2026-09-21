# Delivery, automations and redemption

Release 1.4.0 adds a durable in-app delivery backbone without claiming postal dispatch. The issue #20 implementation adds a provider-gated Resend e-mail path, signed inbound reply webhook, unsubscribe handling and suppression records; production e-mail is enabled only for staged recipients until owner-approved rollout expands it. Evidence is recorded in [email-delivery-provider-evidence-2026-09-12.md](email-delivery-provider-evidence-2026-09-12.md).

## Delivery outbox

Every personal offer, flash campaign offer and automated offer list writes a `DeliveryOutbox` row with a matching `DeliveryEvent`. The row records seller, buyer, channel, source object and a safe content snapshot. If the buyer no longer has active marketing consent or has a seller/global suppression, the status is `suppressed`. If no approved transport is configured, the status is `unsupported` with `TRANSPORT_NOT_CONFIGURED` or `EMAIL_TRANSPORT_CONFIGURATION_INCOMPLETE`.

The outbox is intentionally honest. `queued` means a configured background worker still needs to attempt delivery. `sent` means Resend accepted the API request and the provider message ID was stored. `retryable_failed` means the worker did not receive provider acceptance and will retry within the bounded attempt window. `bounced`, `complained` and `suppressed` are terminal provider/privacy states that prevent future sends to the same seller-buyer channel.

## Resend e-mail adapter

`EMAIL_DELIVERY_PROVIDER=resend` is configured in Production behind `EMAIL_STAGED_RECIPIENTS`. The worker runs at `/api/cron/deliveries`, requires `CRON_SECRET`, re-checks current consent and suppressions, and sends with the row idempotency key. Replies use `reply+{deliveryId}@{RESEND_REPLY_DOMAIN}`. Resend webhooks post to `/api/email/inbound`; the route verifies the raw-body signature, rejects stale or duplicate events, maps valid inbound replies to the existing conversation, and rejects attachments.

Unsubscribe links use `/api/email/unsubscribe?deliveryId=...&token=...`. A valid link creates a seller-scoped suppression without requiring a browser session. The suppression check runs before enqueue and again immediately before send.

## Recurring offer lists

Seller automations live at `/seller/{sellerSlug}/automations`. A schedule targets one active buyer relationship, one channel and one cadence: weekly, fortnightly or monthly. Each manual or cron-triggered run creates an `OfferAutomationRun` ledger entry. When recommendations are eligible, the run creates one buyer-visible `OfferList` snapshot and one delivery outbox row.

The Vercel automation cron endpoint is `/api/cron/automations`; it requires `Authorization: Bearer $CRON_SECRET` and processes a bounded batch of due schedules. The delivery cron endpoint is separate so provider rollout can be monitored and disabled independently.

## Buyer lists and printable letters

Buyers can open `/buyer/lists` to view generated lists. Each list keeps the original product, price, reason and evidence snapshot. `/buyer/letters/{listId}` renders the same list as a print-friendly letter. Printing or viewing a letter is not physical postal delivery.

Sellers can generate a private PDF artifact for an accepted postal offer through `POST /api/sellers/{sellerSlug}/offers/{offerId}/print`. The operation requires current seller access, active postal consent, a current buyer postal address, an unexpired offer and an issued coupon. It freezes reference-price evidence and an address hash in `PrintSnapshot`, renders one tagged A4 document with Google Noto Sans, and stores it through the immutable artifact ledger. Repeating a successful request returns the same snapshot. A failed snapshot can be reclaimed atomically; its next attempt uses a distinct artifact idempotency key.

The seller delivery page exposes the resulting fulfillment queue. PDF download retains the artifact route's seller authorization and short-lived signed URL. Printed and postal-service handoff confirmations are forward-only, versioned and audit-event backed. Reprinting does not alter state. The interface consistently distinguishes postal-service handoff from confirmed recipient delivery.

## Redemption

Accepting an offer issues one `RedemptionCoupon` with a public `DD-XXXXXXXXXX` code. Sellers confirm a code at `/seller/{sellerSlug}/redemptions`. Confirmation is transactional: issued becomes redeemed exactly once, expired codes become expired, and redeemed codes stay redeemed for audit.

Coupons prove DiscountDirect acceptance and seller-side redemption confirmation only. They do not prove payment, external inventory synchronization or fulfillment.

## Privacy recovery

Restriction and erasure workflows withdraw marketing consent and cancel queued, processing or retryable delivery rows for that seller-buyer pair. Completed, suppressed and unsupported rows remain as audit evidence.
# Newsletter snapshot contract

Every successful automated list run now creates one immutable `NewsletterSnapshot` before the outbound delivery is queued. It freezes the buyer and seller scope, ordered product/version/price/reason items, availability window, eligibility reason, consent-check time, Google-font-safe Unicode content hash and template version. The run, list, snapshot and delivery are linked in one Atlas transaction. Holdout buyers and buyers failing consent or frequency rules create a skipped run without a list, snapshot or outbound record. The delivery worker repeats consent, suppression and frequency checks immediately before Resend and retains provider outcomes in the existing delivery ledger.

Recovery never edits a snapshot. A failed transaction leaves no partial newsletter; a transport retry reuses the same delivery and snapshot. Pausing the automation or email transport prevents new sends while preserving evidence.
