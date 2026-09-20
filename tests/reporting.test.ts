import assert from "node:assert/strict";
import test from "node:test";
import { emptyCounters, projectionIsFresh, reduceMetricFacts, utcDay } from "../src/reporting/core.ts";

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
