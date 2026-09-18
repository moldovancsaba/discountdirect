import assert from "node:assert/strict";
import { test } from "node:test";
import { decideDiscount } from "../src/pricing/guardrails.ts";
import { validateSellerSettings } from "../src/settings/validation.ts";

function reason(decision: ReturnType<typeof decideDiscount>) { return decision.allowed ? null : decision.reasonCode; }

test("step pricing accepts only configured steps inside global limits", () => {
  const settings = validateSellerSettings({});
  assert.equal(decideDiscount(settings, "returning", 15).allowed, true);
  assert.equal(reason(decideDiscount(settings, "returning", 17)), "DISCOUNT_STEP_NOT_ALLOWED");
  assert.equal(reason(decideDiscount(settings, "returning", 35)), "DISCOUNT_OUTSIDE_GUARDRAILS");
});

test("guardrail pricing applies segment and retained-price maximums", () => {
  const settings = validateSellerSettings({
    discount_mode: "guardrails",
    discount_guardrails: { floor_pct: 5, max_pct: 60, margin_floor_pct: 50, per_segment_max: { new: 10, loyal: 40 } },
  });
  assert.equal(decideDiscount(settings, "new", 10).allowed, true);
  assert.equal(decideDiscount(settings, "new", 11).allowed, false);
  assert.equal(decideDiscount(settings, "loyal", 40).allowed, true);
  assert.equal(decideDiscount(settings, "loyal", 4).allowed, false);
  assert.equal(reason(decideDiscount(settings, "loyal", 12.5)), "DISCOUNT_NOT_INTEGER");
});
