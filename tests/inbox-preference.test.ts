import assert from "node:assert/strict"; import test from "node:test"; import { inboxPreferenceInput } from "../src/messaging/inbox-core.ts";
test("aggregate inbox ignores client seller scope", () => { assert.deepEqual(inboxPreferenceInput({ mode: "aggregate", sellerId: "untrusted" }), { mode: "aggregate", sellerId: null }); });
test("per-seller inbox requires a selected seller", () => { assert.deepEqual(inboxPreferenceInput({ mode: "per_seller", sellerId: "seller-1" }), { mode: "per_seller", sellerId: "seller-1" }); assert.throws(() => inboxPreferenceInput({ mode: "per_seller" }), /SELLER_REQUIRED/); });
test("inbox mode rejects unknown values", () => { assert.throws(() => inboxPreferenceInput({ mode: "global" }), /INVALID_INBOX_PREFERENCE/); });
