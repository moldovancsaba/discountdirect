import assert from "node:assert/strict";
import test from "node:test";
import { campaignLift, holdoutBucket, isHoldout } from "../src/campaigns/holdout.ts";

test("pooled holdout assignment remains stable between campaigns", () => {
  const base = { sellerId: "seller-1", buyerUserId: "buyer-1", mode: "pooled" as const };
  assert.equal(holdoutBucket({ ...base, campaignKey: "campaign-a" }), holdoutBucket({ ...base, campaignKey: "campaign-b" }));
});

test("per-campaign assignment is deterministic and campaign scoped", () => {
  const input = { sellerId: "seller-1", buyerUserId: "buyer-7", mode: "per_campaign" as const, campaignKey: "product-1:2026-09-20" };
  assert.equal(holdoutBucket(input), holdoutBucket(input));
  assert.equal(isHoldout({ ...input, holdoutPct: 0 }), false);
  assert.throws(() => isHoldout({ ...input, holdoutPct: 21 }), /INVALID_HOLDOUT_PERCENTAGE/);
});

test("campaign lift compares treatment and control purchase rates", () => {
  const result = campaignLift({ treatmentSize: 100, treatmentConversions: 20, holdoutSize: 20, holdoutConversions: 2 });
  assert.equal(result.treatmentRate, 0.2);
  assert.equal(result.holdoutRate, 0.1);
  assert.equal(result.incrementalRate, 0.1);
  assert.equal(result.estimatedIncrementalConversions, 10);
  assert.equal(result.comparable, true);
});
