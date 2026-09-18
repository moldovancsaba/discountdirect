import assert from "node:assert/strict";
import { test } from "node:test";
import { decideMarketingSend } from "../src/consent/decision.ts";

const base = { basis: "legitimate_interest" as const, softOptIn: true, relationshipActive: true, customerActive: true, preferenceStatus: null, orderCount: 1, frequencyCount: 0, frequencyCap: 4 };

test("legitimate interest allows an active prior-customer relationship", () => {
  assert.deepEqual(decideMarketingSend(base), { allowed: true, reasonCode: "ALLOWED_LEGITIMATE_INTEREST", cap: 4, count: 0 });
});

test("an objection overrides consent and legitimate interest", () => {
  assert.equal(decideMarketingSend({ ...base, preferenceStatus: "unsubscribed" }).reasonCode, "CHANNEL_OBJECTED");
  assert.equal(decideMarketingSend({ ...base, basis: "consent", preferenceStatus: "unsubscribed" }).allowed, false);
});

test("consent markets require an explicit grant", () => {
  assert.equal(decideMarketingSend({ ...base, basis: "consent", preferenceStatus: null }).reasonCode, "CONSENT_REQUIRED");
  assert.equal(decideMarketingSend({ ...base, basis: "consent", preferenceStatus: "subscribed" }).reasonCode, "ALLOWED_CONSENT");
});

test("frequency caps and missing purchase relationships fail closed", () => {
  assert.equal(decideMarketingSend({ ...base, frequencyCount: 4 }).reasonCode, "FREQUENCY_CAP_REACHED");
  assert.equal(decideMarketingSend({ ...base, orderCount: 0 }).reasonCode, "NO_PURCHASE_RELATIONSHIP");
  assert.equal(decideMarketingSend({ ...base, relationshipActive: false }).reasonCode, "RELATIONSHIP_INACTIVE");
});
