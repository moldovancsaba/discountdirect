# Seller Membership

Buyer enrollments use the separate `customer_memberships` collection; staff `memberships` remain authorization records. Enrollment requires an active seller-buyer relationship, is idempotent, and uses optimistic version checks on leave. Tiers are derived from authoritative order count and HUF totals: member, silver, or gold. Benefits are deterministic and never override consent, suppression, or seller access checks. Rule version: `membership-2026-09-25-v1`.
