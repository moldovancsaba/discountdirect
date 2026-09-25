import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveCustomerSegment } from "../src/relationships/segments.ts";
import { deriveMembershipTier, membershipBenefits, membershipDecision } from "../src/membership/core.ts";

const day = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(Date.UTC(2026, 0, 1) + days * day);

test("segment derivation covers order count and tenure boundaries", () => {
  const cases = [
    { count: 0, first: null, last: null, expected: "new" },
    { count: 1, first: at(0), last: at(0), expected: "new" },
    { count: 2, first: at(0), last: at(365), expected: "returning" },
    { count: 4, first: at(0), last: at(179), expected: "returning" },
    { count: 4, first: at(0), last: at(180), expected: "loyal" },
    { count: 12, first: at(0), last: at(730), expected: "loyal" },
  ] as const;
  for (const item of cases) assert.equal(deriveCustomerSegment(item.count, item.first, item.last), item.expected);
});

test("segment derivation rejects invalid counts and inconsistent dates", () => {
  assert.throws(() => deriveCustomerSegment(-1, null, null), /orderCount/);
  assert.equal(deriveCustomerSegment(4, at(20), at(10)), "returning");
});

test("membership tiers and benefits are deterministic and consent-aware", () => {
  assert.equal(deriveMembershipTier(2, 100000), "member");
  assert.equal(deriveMembershipTier(5, 100000), "silver");
  assert.equal(deriveMembershipTier(1, 500000), "gold");
  assert.deepEqual(membershipBenefits("gold"), { freeDelivery: true, earlyAccessHours: 48 });
  const starts = new Date("2026-10-10T12:00:00Z");
  assert.equal(membershipDecision({ status: "active", tier: "silver", campaignStartsAt: starts, now: new Date("2026-10-09T12:00:00Z"), consentAllowed: true }).earlyAccess, true);
  assert.equal(membershipDecision({ status: "active", tier: "gold", campaignStartsAt: starts, now: new Date("2026-10-08T12:00:00Z"), consentAllowed: false }).eligible, false);
});
