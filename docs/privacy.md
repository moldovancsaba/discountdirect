# Privacy and channel preferences

Release 0.8.0 provides a seller-scoped workflow for marketing consent and data-subject requests. It is an engineering control, not legal approval. Real personal data and marketing remain blocked until the controller owner approves the assessment, Hungarian notice copy, retention rules and operating procedure required by issue #7.

The current controller/operating record is `docs/privacy-controller-record-2026-09-12.md`. Release 1.4.1 still blocks real outbound marketing because no approved delivery provider exists; issue #20 owns that provider decision and verification.

## Buyer controls

An authenticated buyer opens `/buyer/{sellerSlug}/preferences`. E-mail and postal marketing are separate, optional choices. Saving a new opt-in or changing an existing choice writes the current preference and an append-only event with purpose `marketing`, the exact notice version, time and actor. Saving the same state twice is idempotent. A missing preference means no consent.

The current notice identifier is `privacy-hu-2026-09-09-v1`. Publish a new identifier whenever the approved notice materially changes; never rewrite old events.

Buyers can request:

- an access export;
- restriction of processing;
- erasure of seller-side personal identifiers.

Only one open request of a type exists for a buyer and seller. Repeated and concurrent submissions return the open request instead of creating parallel work.

## Seller workflow

An active seller member opens `/seller/{sellerSlug}/privacy`. Requests move from `requested` to `processing`, then `completed` or `failed`. A failed request can return to `processing`. Every transition requires a bounded processing note and records the handler.

Completing an access request creates a JSON snapshot with the seller-specific account link, customer record, preferences, consent history and purchase history. The requesting buyer can download it for seven days. The export endpoint checks the authenticated buyer, seller relationship, request ID and expiry.

Completing restriction changes the customer record to restricted and withdraws all subscribed marketing channels. Completing erasure anonymizes the seller-side customer identity, withdraws marketing and revokes that seller relationship. Purchase rows keep their commercial snapshots because financial retention can still apply. The shared DoneIsBetter account and relationships with other sellers are not changed.

## Delivery gate

Delivery code calls the server-side marketing eligibility check immediately before creating a delivery row. It returns false unless the exact seller and buyer have an active customer record and a subscribed preference for that channel. Restriction and erasure workflows cancel queued, processing and retryable delivery work for the buyer. Real external marketing transport remains disabled until issue #20 selects and verifies a provider.

## API

- `GET/PATCH /api/buyer/{sellerSlug}/preferences`
- `POST /api/buyer/{sellerSlug}/privacy-requests`
- `GET /api/buyer/{sellerSlug}/privacy-export?requestId=...`
- `GET /api/sellers/{sellerSlug}/privacy-requests`
- `PATCH /api/sellers/{sellerSlug}/privacy-requests/{requestId}`

Cookie-authenticated writes require the same origin. Responses are never cached. Invalid transitions return conflict rather than silently skipping required workflow states.
