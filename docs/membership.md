# Seller Membership

Buyer enrollments use the separate `customer_memberships` collection; staff `memberships` remain authorization records. Enrollment requires an active seller-buyer relationship, is idempotent, and uses optimistic version checks on leave. Tiers are derived from authoritative order count and HUF totals: member, silver, or gold. Benefits are deterministic and never override consent, suppression, or seller access checks. Rule version: `membership-2026-09-25-v1`.
## Buyer API

The seller-scoped resource is `/api/buyer/:sellerSlug/membership`.

- `GET` returns the current membership or `not_joined`.
- `POST` joins or reactivates membership idempotently and derives the tier from
  the current seller relationship metrics.
- `DELETE` requires the returned `version` and uses optimistic concurrency;
  stale versions return `409` without changing membership state.

All operations require SSO authentication and an active buyer relationship.

## Campaign provenance

When a flash campaign audience is snapshotted, the active membership tier and
free-delivery benefit are frozen on each audience item. Postal delivery content
uses that frozen decision, so later membership changes cannot rewrite an already
launched campaign. Consent, suppression and channel eligibility are evaluated
independently and always win over membership benefits.
