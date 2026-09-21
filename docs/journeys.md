# Durable customer journeys

DD-041 adds bounded, versioned multi-step customer journeys without introducing a second business-state store. A seller owner validates and activates a definition for an active customer/buyer relationship. The definition version freezes its trigger, ordered steps and active rule-template provenance. Manual triggers use a server-validated timestamp; purchase-age triggers are accepted only when the latest active purchase evidence satisfies the configured UTC-day threshold.

Each accepted trigger creates one `JourneyEnrollment` and one scheduled `JourneyStepRun` per step in an Atlas transaction. The enrollment is unique by definition, buyer and trigger-evidence hash. A step is unique by enrollment, step key and scheduled time. The ten-minute Vercel cron claims at most 50 due rows with a two-minute lease. It postpones later steps until earlier steps are terminal, rechecks definition and enrollment state, and increments attempts only after those checks.

Execution rechecks current channel consent through the shared delivery service, freezes step content and rule provenance, and creates a delivery with a stable journey idempotency key. Suppressed or unsupported deliveries become truthful `skipped` step outcomes. Transient failures retry after 5, 30 and 120 minutes; the third failed attempt is terminal. A deployment replacement may reclaim only an expired processing lease.

Seller contracts are under `/api/sellers/:sellerSlug/journeys`, with a read-only `/preview` route and optimistic status changes on `/:journeyId`. Buyer evidence is read-only at `/api/buyer/journeys`. `/api/cron/journeys` requires `CRON_SECRET`. The seller interface uses only GDS primitives and Hungarian labels.

## Recovery

Pause a definition to stop claims and atomically cancel that definition's queued, processing or retryable deliveries. A worker rechecks the active definition inside its delivery transaction, so a concurrent pause cannot create a new delivery. Existing step, delivery and event records remain as evidence. Resume with the current optimistic version; due steps are reconsidered after their postponed `nextRunAt`. Never edit definition versions, evidence hashes or frozen snapshots in place.
