import assert from "node:assert/strict";
import test from "node:test";
import { conversationSubscription } from "../src/realtime/contracts.ts";

test("conversation subscriptions accept a bounded conversation id and optional cursor", () => {
  assert.deepEqual(conversationSubscription({ conversationId: "0123456789abcdef01234567", cursor: "cursor-value" }), { conversationId: "0123456789abcdef01234567", cursor: "cursor-value" });
  assert.deepEqual(conversationSubscription({ conversationId: "0123456789abcdef01234567" }), { conversationId: "0123456789abcdef01234567", cursor: null });
});

test("conversation subscriptions reject malformed ids and unbounded cursors", () => {
  assert.equal(conversationSubscription({ conversationId: "not-an-id" }), null);
  assert.equal(conversationSubscription({ conversationId: "0123456789abcdef01234567", cursor: "x".repeat(257) }), null);
  assert.equal(conversationSubscription(null), null);
});
