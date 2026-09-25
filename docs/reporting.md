# Reporting read model

Status: implemented foundation (DD-035). Schema version: `1`.

Reporting is derived only from MongoDB source-of-truth collections. `metric_rollups` is disposable and must never authorize, reserve stock, send a message, redeem a coupon, or mutate a purchase. Seller dashboards read only the generation named by `metric_projection_checkpoints.activeGenerationId`.

The hourly `GET /api/cron/metrics` route requires `Authorization: Bearer $CRON_SECRET`. It recomputes a bounded 90-day seller window plus the latest 500 campaign measurements. Every rebuild writes a fresh generation, then publishes its identifier. A failed run removes its partial generation and preserves the previous active generation.

## Operational states

- `ready`: the seller dashboard may read the active generation.
- `running`: the previous active generation remains readable while replacement is built.
- `failed`: the operator view exposes the failure; the previous generation remains available but becomes visibly stale.
- No generation: the seller UI displays an unavailable state, never fabricated zeroes.
- Source queries are capped at 20,000 records per source and cron batches at 50 sellers. Larger tenants require pagination before increasing these limits.

Recovery is to correct the source record or code, rerun the projector, and verify the checkpoint. Rollback is to stop the cron and retain the previous active generation. Derived collections may be dropped and rebuilt without transactional data loss.

Reducer tests cover deterministic totals, refunds, revenue, UTC day boundaries, and stale-state behavior. Release verification also requires index creation, one authenticated cron run, operator health inspection, and a seller dashboard check against source counts.
# Attribution and margin

Attribution uses the signed offer hand-off first, then a bounded campaign window, and otherwise reports an unattributed order. Revenue is reduced by recorded refunds and margin is shown only when a frozen product-cost revision exists. Missing cost, insufficient evidence, and refund anomalies remain visible warnings; the rule version is `attribution-2026-09-25-v1`.

Seller owners manage immutable product-cost revisions through
`/api/sellers/:sellerSlug/products/:productId/cost-revisions`. Revisions have an
increasing product-local version and effective timestamp. The endpoint is
SSO-protected and rejects non-owner access, invalid HUF values, future dates,
and unknown products. Reporting consumers select the latest revision effective
at order time and never overwrite historical cost evidence.

Campaign detail responses now include `attribution`: purchase count, refund
count, net attributed revenue, margin only where an effective cost revision is
available, and an explicit missing-cost count. The query is bounded to the
campaign product and campaign time window; it never turns missing evidence into
zero margin.

Seller metrics can be exported from
`/api/sellers/:sellerSlug/metrics/export` with the same optional `from` and `to`
date parameters as the dashboard. The export is limited to the active bounded
projection, contains aggregate daily counters only, and returns `409` while no
ready generation exists.
