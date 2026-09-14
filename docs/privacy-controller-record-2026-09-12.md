# Privacy controller record — 2026-09-12

This record documents the engineering controls for DiscountDirect release 1.5.0. It is not legal advice and does not approve broad real-customer marketing. Issue #20 enables a staged Resend e-mail path for approved recipients only; live outbound acceptance and a signed inbound reply callback are verified in controlled production evidence. Postal dispatch and expansion beyond staged recipients remain blocked until controller approval.

## Current launch boundary

- Allowed: synthetic verification, staged Resend e-mail verification to approved recipients, authenticated seller/buyer/operator workflows, in-app offers, in-app conversations, in-app offer lists, printable buyer letters and redemption coupons.
- Not allowed: broad outbound e-mail to customers, postal dispatch, purchased contact lists or importing real customer data without controller approval.
- Delivery rows are audit/outbox records. They must remain `unsupported`, `suppressed`, `queued`, `retryable`, `cancelled` or another truthful state; they must not be relabeled as sent without external-provider evidence.

## Notice and consent

- Current notice identifier: `privacy-hu-2026-09-09-v1`.
- Consent is seller-scoped and channel-specific.
- A missing preference means no consent.
- The delivery gate checks active seller-buyer relationship, active customer record, subscribed channel and suppressions immediately before writing a delivery row and again before provider send.
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
- Resend is the selected e-mail adapter path for issue #20 and is production-active only behind staged-recipient controls.

Current infrastructure uses Vercel dynamic egress to Atlas and server-only secrets. Static egress or Secure Compute remains a hardening option before real marketing launch.

## Verification evidence

- `pnpm test:auth-integration` covers consent evidence, request deduplication, access export, marketing suppression, participant isolation, honest delivery outbox states, buyer lists and single-use coupon redemption.
- `pnpm db:indexes` confirms the privacy, delivery, automation and redemption indexes are present.
- `docs/delivery-automation-redemption.md`, `docs/email-delivery-provider-evidence-2026-09-12.md`, `docs/privacy.md`, `docs/operations-alerts.md` and this record describe the current support and recovery procedures.
