# Delivery, automations and redemption

Release 1.4.0 adds a durable in-app delivery backbone without claiming real e-mail or postal dispatch.

## Delivery outbox

Every personal offer, flash campaign offer and automated offer list writes a `DeliveryOutbox` row with a matching `DeliveryEvent`. The row records seller, buyer, channel, source object and a safe content snapshot. If the buyer no longer has active marketing consent, the status is `suppressed`. If no approved transport is configured, the status is `unsupported` with `TRANSPORT_NOT_CONFIGURED`.

The outbox is intentionally honest. `unsupported` means DiscountDirect created an in-app record but did not send e-mail or post. Issue #20 owns real provider selection, SPF/DKIM/DMARC evidence, signed inbound webhooks, unsubscribe handling and bounce/complaint suppression.

## Recurring offer lists

Seller automations live at `/seller/{sellerSlug}/automations`. A schedule targets one active buyer relationship, one channel and one cadence: weekly, fortnightly or monthly. Each manual or cron-triggered run creates an `OfferAutomationRun` ledger entry. When recommendations are eligible, the run creates one buyer-visible `OfferList` snapshot and one delivery outbox row.

The Vercel cron endpoint is `/api/cron/automations`; it requires `Authorization: Bearer $CRON_SECRET` and processes a bounded batch of due schedules. The cron never contacts buyers directly in this release.

## Buyer lists and printable letters

Buyers can open `/buyer/lists` to view generated lists. Each list keeps the original product, price, reason and evidence snapshot. `/buyer/letters/{listId}` renders the same list as a print-friendly letter. Printing or viewing a letter is not physical postal delivery.

## Redemption

Accepting an offer issues one `RedemptionCoupon` with a public `DD-XXXXXXXXXX` code. Sellers confirm a code at `/seller/{sellerSlug}/redemptions`. Confirmation is transactional: issued becomes redeemed exactly once, expired codes become expired, and redeemed codes stay redeemed for audit.

Coupons prove DiscountDirect acceptance and seller-side redemption confirmation only. They do not prove payment, external inventory synchronization or fulfillment.

## Privacy recovery

Restriction and erasure workflows withdraw marketing consent and cancel queued, processing or retryable delivery rows for that seller-buyer pair. Completed, suppressed and unsupported rows remain as audit evidence.
