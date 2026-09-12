# Privacy controller record — 2026-09-12

This record documents the engineering controls for DiscountDirect release 1.5.0. It is not legal advice and does not approve real outbound marketing. Real e-mail/postal dispatch remains blocked until issue #20 selects and verifies a provider, sender domain, unsubscribe, bounce/complaint handling and signed inbound callbacks.

## Current launch boundary

- Allowed: synthetic verification, authenticated seller/buyer/operator workflows, in-app offers, in-app conversations, in-app offer lists, printable buyer letters and redemption coupons.
- Not allowed: real outbound e-mail, postal dispatch, provider webhooks, purchased contact lists or importing real customer data without controller approval.
- Delivery rows are audit/outbox records. They must remain `unsupported`, `suppressed`, `queued`, `retryable`, `cancelled` or another truthful state; they must not be relabeled as sent without external-provider evidence.

## Notice and consent

- Current notice identifier: `privacy-hu-2026-09-09-v1`.
- Consent is seller-scoped and channel-specific.
- A missing preference means no consent.
- The delivery gate checks active seller-buyer relationship, active customer record and subscribed channel immediately before writing a delivery row.
- Restriction and erasure withdraw subscribed marketing channels and cancel queued, processing or retryable delivery rows for the affected seller-buyer pair.

## Data subject procedures

| Request | Current behavior |
| --- | --- |
| Access | Seller-scoped JSON export includes account link, customer record, preferences, consent history and purchase history. Export is available to the requesting buyer for seven days. |
| Restriction | Customer status becomes restricted, marketing channels are withdrawn, and queued/retryable delivery work is cancelled. |
| Erasure | Seller-side customer identity is anonymized, marketing is withdrawn and the seller relationship is revoked. Purchase rows keep commercial snapshots where financial retention can still apply. |

Only one open request of each type exists per seller-buyer pair. Repeated or concurrent submissions return the open request rather than creating duplicates.

## Retention and minimization

- Session, activation, recovery and rate-limit records use TTL indexes where applicable.
- Access export artifacts expire after seven days.
- Consent events, privacy request transitions, delivery events, offer decisions, campaign reservations and redemption events are retained as audit evidence.
- Purchase rows keep product/order snapshots needed for commercial evidence and recommendation explainability; erasure removes seller-side personal identifiers rather than rewriting financial facts.
- Issue comments, logs and alerts must not include raw secrets, buyer content, raw e-mail addresses, activation links, recovery links or coupon codes.

## Processors and transfer posture

- Vercel hosts the Next.js application and cron.
- MongoDB Atlas stores application records.
- DoneIsBetter SSO provides authentication identity data.
- GitHub stores source, issues and project-board evidence.

Current infrastructure uses Vercel dynamic egress to Atlas and server-only secrets. Static egress or Secure Compute remains a hardening option before real marketing launch.

## Verification evidence

- `pnpm test:auth-integration` covers consent evidence, request deduplication, access export, marketing suppression, participant isolation, honest delivery outbox states, buyer lists and single-use coupon redemption.
- `pnpm db:indexes` confirms the privacy, delivery, automation and redemption indexes are present.
- `docs/delivery-automation-redemption.md`, `docs/privacy.md`, `docs/operations-alerts.md` and this record describe the current support and recovery procedures.
