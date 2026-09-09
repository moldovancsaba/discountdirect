# Deterministic recommendation rules

Release 0.9.0 provides seller-only recommendation previews. A preview never sends a message, creates an offer or claims a sale. It stores the exact rule version, product snapshot and purchase evidence needed to reproduce the result.

Rule version `recommendations-2026-09-v1` uses this precedence:

1. `COMPATIBLE_ACCESSORY` — 300 points when an active, stocked product names a purchased SKU in `compatibleWith`.
2. `REPLENISHMENT` — 200 points when the same SKU was last purchased at least 90 days ago.
3. `SAME_CATEGORY` — 100 points for an unpurchased active product in a category evidenced by another purchased catalog product.

Higher points sort first; equal scores sort by stable product ID. The engine returns at most 20 results. Refunded and corrected rows are not evidence. Inactive or zero-stock products are excluded before rules run. It uses no learned score, external AI, browsing behavior, sensitive attribute or cross-seller record.

Before ranking, the service requires an active customer, active buyer relationship and subscribed preference for the selected e-mail or postal channel. A blocked preview stores clear reason codes without recommendations. Repeating a preview against unchanged inputs returns the same snapshot.

Seller members create previews from the selected customer in `/seller/{sellerSlug}/customers`. The API is `POST /api/sellers/{sellerSlug}/customers/{customerId}/recommendations`; the same route supports `GET` with `previewId`. Cookie-authenticated writes require the same origin.
