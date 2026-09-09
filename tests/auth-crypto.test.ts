import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  normalizeEmail,
  validatePassword,
  verifyPassword,
} from "../src/auth/crypto.ts";

test("email normalization is stable and rejects malformed input", () => {
  assert.equal(normalizeEmail(" Person@Example.COM "), "person@example.com");
  assert.throws(() => normalizeEmail("not-an-email"), /INVALID_EMAIL/);
});

test("password hashing uses a random salt and verifies safely", async () => {
  const password = "Long test password 2026";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("incorrect password", first), false);
  assert.equal(await verifyPassword(password, "invalid"), false);
  assert.throws(() => validatePassword("too-short"), /INVALID_PASSWORD/);
});

test("opaque tokens have sufficient entropy and fixed-size hashes", () => {
  const first = createOpaqueToken();
  const second = createOpaqueToken();
  assert.notEqual(first, second);
  assert.ok(first.length >= 43);
  assert.match(hashOpaqueToken(first), /^[a-f0-9]{64}$/);
});
