import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSession,
  verifySession,
  matchesToken,
  SESSION_SECONDS,
} from "../src/lib/operator-session.ts";
const secret = "test-only-secret-".repeat(4);
const now = 1800000000000;
test("operator access fails closed without a strong configured token", () => {
  assert.equal(matchesToken("", undefined), false);
  assert.equal(matchesToken("short", "short"), false);
  assert.equal(matchesToken(secret, secret), true);
  assert.equal(matchesToken("incorrect", secret), false);
});
test("sessions expire and cannot be forged or survive token rotation", () => {
  const session = createSession(secret, now);
  assert.equal(verifySession(session, secret, now), true);
  assert.equal(
    verifySession(session, secret, now + SESSION_SECONDS * 1000),
    false,
  );
  assert.equal(verifySession(session, secret + "rotated", now), false);
  assert.equal(verifySession(session.slice(0, -1) + "z", secret, now), false);
  assert.equal(verifySession(undefined, secret, now), false);
  assert.equal(verifySession("invalid", secret, now), false);
});
