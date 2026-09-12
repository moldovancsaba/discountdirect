# Offers

Release 1.2.0 lets a seller create a durable personal offer from one eligible, consented recommendation preview. The server reads the preview's product, original integer-HUF price, rule reason and evidence identifiers; the browser cannot supply or override those values. The only mutable creation inputs are a whole-percent discount from 0 through 100 and an expiry no more than 30 days ahead. The stored price is `Math.round(originalHuf * (100 - discountPct) / 100)`.

Offers are unique per seller, creator and client request ID. Repeating a creation request returns the original snapshot, rather than issuing another offer. An offer is linked to the seller/buyer conversation when one exists and updates that conversation's pending-offer count. It also writes a delivery outbox row. Without an approved transport provider the row is `unsupported`, not sent; its selected recommendation channel is an authorization gate and audit fact, not delivery evidence.

Only the targeted buyer with an active seller relationship can respond. A response compares the supplied version with the pending record and uses server time for expiry. The same decision is retry-safe; a competing decision, stale version or expired offer is rejected. An accepted offer issues one single-use DiscountDirect redemption coupon. A flash-campaign offer also creates an atomic DiscountDirect inventory reservation when accepted. Neither path claims payment, delivery or fulfillment.

Use `POST /api/sellers/{sellerSlug}/offers` to create from `{previewId, productId, discountPct, expiresAt, clientRequestId}`, `GET /api/offers` for the buyer inbox, and `POST /api/offers/{offerId}/respond` with `{expectedVersion, decision}`. Every mutation uses the existing cookie session and same-origin JSON validation.
