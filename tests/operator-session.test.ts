import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesToken } from "../src/lib/operator-session.ts";
const secret = "test-only-secret-".repeat(4);

test("machine bearer token checks fail closed without a strong configured secret", () => {
  assert.equal(matchesToken("", undefined), false);
  assert.equal(matchesToken("short", "short"), false);
  assert.equal(matchesToken(secret, secret), true);
  assert.equal(matchesToken("incorrect", secret), false);
  assert.equal(matchesToken("x".repeat(1025), secret), false);
});
