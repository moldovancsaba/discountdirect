import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { normalizeRcsNumber, rcsRetryable, validateRcsMessage, verifyRcsCallback } from "../src/channels/rcs-core.ts";

test("RCS contract validates recipient and bounded rich message fields", () => {
  assert.equal(normalizeRcsNumber("+36 30 123 4567"), "+36301234567");
  assert.equal(validateRcsMessage({ fallbackText: "Megérkezett az ajánlatod", title: "Ajánlat", deepLink: "https://discountdirect.vercel.app/o/1" }).title, "Ajánlat");
  assert.throws(() => normalizeRcsNumber("06301234567"), /RCS_NUMBER_INVALID/);
  assert.throws(() => validateRcsMessage({ fallbackText: "", imageUrl: "http://unsafe.example" }), /RCS_MESSAGE_INVALID/);
});

test("RCS callback verification rejects stale or forged events", () => {
  const payload = "{\"id\":\"evt-1\"}";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const secret = "r".repeat(32);
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  assert.equal(verifyRcsCallback(payload, timestamp, signature, secret), true);
  assert.throws(() => verifyRcsCallback(payload, timestamp, "0".repeat(64), secret), /RCS_CALLBACK_INVALID/);
  assert.equal(rcsRetryable(503), true);
  assert.equal(rcsRetryable(422), false);
});
