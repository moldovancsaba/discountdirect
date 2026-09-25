import assert from "node:assert/strict";
import test from "node:test";
import { emptyCounters, projectionIsFresh, reduceMetricFacts, utcDay } from "../src/reporting/core.ts";
import { attributeOrder } from "../src/reporting/attribution.ts";

test("reporting reducer is deterministic and includes corrections", () => {
  const facts = [{ kind: "purchases" as const }, { kind: "revenueHuf" as const, value: 1200 }, { kind: "refunds" as const }, { kind: "sentDeliveries" as const }];
  assert.deepEqual(reduceMetricFacts(facts), { ...emptyCounters(), purchases: 1, revenueHuf: 1200, refunds: 1, sentDeliveries: 1 });
  assert.deepEqual(reduceMetricFacts([...facts].reverse()), reduceMetricFacts(facts));
});
test("UTC day bucketing is stable across offsets", () => {
  assert.equal(utcDay("2026-09-20T23:30:00-02:00").toISOString(), "2026-09-21T00:00:00.000Z");
  assert.throws(() => utcDay("not-a-date"), /INVALID_METRIC_DATE/);
});
test("projection freshness exposes stale generations", () => {
  const now = new Date("2026-09-20T12:00:00Z");
  assert.equal(projectionIsFresh("2026-09-19T11:00:01Z", now), true);
  assert.equal(projectionIsFresh("2026-09-19T09:59:59Z", now), false);
});
test("attribution prefers signed evidence and computes frozen-cost margin", () => {
  const result = attributeOrder({ orderId: "order-1", orderAt: new Date("2026-09-10"), revenueHuf: 10000, signedOfferId: "offer-1", signedHandoffId: "handoff-1", campaignOfferId: "offer-2", campaignCreatedAt: new Date("2026-09-01"), campaignExpiresAt: new Date("2026-09-30") }, { unitCostHuf: 6000, effectiveAt: new Date("2026-09-01"), version: 3 });
  assert.equal(result.method, "signed_handoff"); assert.equal(result.marginHuf, 4000); assert.equal(result.confidence, "high");
});

test("attribution multiplies frozen unit cost by order quantity", () => {
  const result = attributeOrder(
    { orderId: "order-quantity", orderAt: new Date("2026-09-10"), revenueHuf: 30000, quantity: 3, signedOfferId: "offer-quantity", signedHandoffId: "handoff-quantity" },
    { unitCostHuf: 6000, effectiveAt: new Date("2026-09-01"), version: 1 },
  );
  assert.equal(result.marginHuf, 12000);
});
test("attribution reports missing evidence without causal overclaim", () => {
  const result = attributeOrder({ orderId: "order-2", orderAt: new Date("2026-10-01"), revenueHuf: 10000, refundedHuf: 12000 });
  assert.equal(result.method, "unattributed"); assert.equal(result.netRevenueHuf, 0); assert.equal(result.warning, "INSUFFICIENT_EVIDENCE");
  const campaign = attributeOrder({ orderId: "order-3", orderAt: new Date("2026-09-10"), revenueHuf: 10000, campaignOfferId: "offer-3", campaignCreatedAt: new Date("2026-09-01"), campaignExpiresAt: new Date("2026-09-30") });
  assert.equal(campaign.warning, "MISSING_COST");
});
