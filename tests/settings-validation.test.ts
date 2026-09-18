import assert from "node:assert/strict";
import { test } from "node:test";
import { validateSellerSettings } from "../src/settings/validation.ts";

test("seller settings apply the SSOT defaults", () => {
  const value = validateSellerSettings({});
  assert.deepEqual(value.discount_steps, [10, 15, 20, 25]);
  assert.equal(value.holdout_pct, 10);
  assert.equal(value.frequency_cap.email_per_30d, 4);
  assert.equal(value.checkout_handoff.price_lock_minutes, 60);
});

test("seller settings reject unknown keys and out-of-range values", () => {
  assert.throws(() => validateSellerSettings({ surprise: true }), /unknown_key/);
  assert.throws(() => validateSellerSettings({ holdout_pct: 21 }), /holdout_pct/);
  assert.throws(() => validateSellerSettings({ discount_guardrails: { floor_pct: 40, max_pct: 20, margin_floor_pct: 10, per_segment_max: {} } }), /range/);
  assert.throws(() => validateSellerSettings({ frequency_cap: { email_per_30d: 4, chat_per_7d: 3, mailing_per_90d: 1, rcs_per_7d: 1, extra: 2 } }), /frequency_cap/);
});

test("seller settings normalize unique sorted discount steps", () => {
  assert.deepEqual(validateSellerSettings({ discount_steps: [25, 10, 10, 15] }).discount_steps, [10, 15, 25]);
});
