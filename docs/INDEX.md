# Documentation index

Every document under `docs/` is listed once. "Currency" is the date of the file's last commit (`git log`) and, where the document carries its own date, that date; dates are `YYYY-MM-DD`. The repository HEAD at the time of writing is 2026-09-30.

Documents outside this folder: [README](../README.md) (entry point), [HANDOVER](../HANDOVER.md) (state and first-hour checklist), [AGENTS](../AGENTS.md) (rules for agents), [IMPLEMENTATION_PLAN](../IMPLEMENTATION_PLAN.md) (original plan, historical), [RELEASE_NOTES](../RELEASE_NOTES.md) (changelog).

## Start here

| Document | Purpose | Currency |
| --- | --- | --- |
| [implementation-baseline.md](implementation-baseline.md) | Verified stack, environment variable names, collections, routes, capabilities and known gaps; the local source of truth. | Last commit 2026-09-30; states its own verification as 2026-09-25. |
| [operations.md](operations.md) | Local setup, verification commands, deployment steps and recovery runbooks (connectors, hand-off, journeys, artifacts, postal, Redis). | Last commit 2026-09-30. |
| [architecture.md](architecture.md) | Routes, database connection, authorization model and domain design decisions by release. | Last commit 2026-09-25. |

## Product capabilities

| Document | Purpose | Currency |
| --- | --- | --- |
| [authentication.md](authentication.md) | DoneIsBetter SSO flow, index preparation, account provisioning, revocation. | Last commit 2026-09-15. |
| [catalog.md](catalog.md) | Seller catalog and JSON import. | Last commit 2026-09-09; written for release 0.5.0, may lag later pricing and connector changes. |
| [purchases.md](purchases.md) | Purchase ledger: customers, order lines, imports, corrections. | Last commit 2026-09-09; written for release 0.6.0. |
| [privacy.md](privacy.md) | Seller-scoped consent and data-subject request workflow. | Last commit 2026-09-25. |
| [recommendations.md](recommendations.md) | Deterministic, versioned recommendation previews. | Last commit 2026-09-09; written for release 0.9.0. |
| [rule-templates.md](rule-templates.md) | Immutable rule-template versions and seller override provenance. | Last commit 2026-09-21. |
| [conversations.md](conversations.md) | Durable seller-buyer conversations. | Last commit 2026-09-18. |
| [marketplace-inbox.md](marketplace-inbox.md) | Buyer inbox modes (aggregate and per seller). | Last commit 2026-09-21. |
| [realtime.md](realtime.md) | Socket.IO transport over durable conversations, replay and presence. | Last commit 2026-09-12. |
| [offers.md](offers.md) | Personal offers: creation from previews, buyer decisions. | Last commit 2026-09-25. |
| [campaigns.md](campaigns.md) | Flash campaigns, reservations and holdout measurement. | Last commit 2026-09-25. |
| [delivery-automation-redemption.md](delivery-automation-redemption.md) | Delivery outbox, e-mail path, offer-list automations and coupon redemption. | Last commit 2026-09-21. |
| [journeys.md](journeys.md) | Versioned multi-step customer journeys and their scheduler. | Last commit 2026-09-25. |
| [membership.md](membership.md) | Buyer membership enrollment (`customer_memberships`). | Last commit 2026-09-25. |
| [reporting.md](reporting.md) | Generation-based reporting read model and hourly projector (DD-035). | Last commit 2026-09-25. |
| [whatsapp.md](whatsapp.md) | WhatsApp delivery contract (provider-neutral foundation). | Last commit 2026-09-25. |
| [rcs.md](rcs.md) | RCS delivery contract (provider-neutral foundation). | Last commit 2026-09-25. |

## Operations and alerting

| Document | Purpose | Currency |
| --- | --- | --- |
| [operations-alerts.md](operations-alerts.md) | Production alert owners, channels and thresholds for release 1.5.0. | Last commit 2026-09-23. |

## Dated evidence records (point-in-time snapshots; do not treat as current state)

| Document | Purpose | Currency |
| --- | --- | --- |
| [data-environment-evidence-2026-09-12.md](data-environment-evidence-2026-09-12.md) | Vercel project and Atlas environment evidence. | Dated 2026-09-12. |
| [realtime-production-evidence-2026-09-12.md](realtime-production-evidence-2026-09-12.md) | Go/no-go and production probe result for realtime. | Dated 2026-09-12. |
| [email-delivery-provider-evidence-2026-09-12.md](email-delivery-provider-evidence-2026-09-12.md) | E-mail provider decision and staged production round-trip evidence. | Dated 2026-09-12; updated through 2026-09-14. |
| [quality-evidence-2026-09-12.md](quality-evidence-2026-09-12.md) | Release 1.5.0 verification run. | Dated 2026-09-12; last commit 2026-09-14. |
| [privacy-controller-record-2026-09-12.md](privacy-controller-record-2026-09-12.md) | Engineering controls record for release 1.5.0; not legal advice. | Dated 2026-09-12; last commit 2026-09-14. |
