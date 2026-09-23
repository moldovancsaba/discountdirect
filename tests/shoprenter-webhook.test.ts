import test from "node:test";
import assert from "node:assert/strict";
import { ShoprenterWebhookError, verifyShoprenterCallback } from "../src/connectors/shoprenter-webhook.ts";

const secret = "shoprenter-webhook-secret-at-least-32-characters";
const payload = JSON.stringify({
  event: "order_confirm",
  orders: { order: [{ storeName: "demo", innerId: "190", dateCreated: "2026-09-20T10:00:00Z", currency: "HUF", totalGross: "12990", statusText: "Feldolgozás alatt" }] },
});

test("Shoprenter callback verifies its secret and normalizes a bounded order", () => {
  const result = verifyShoprenterCallback(payload, secret, "demo", secret);
  assert.equal(result.event, "order_confirm");
  assert.equal(result.providerId, "190");
  assert.equal(result.canonical.payload.totalHuf, 12990);
  assert.match(result.payloadHash, /^[a-f0-9]{64}$/);
  assert.equal(result.payloadHash, verifyShoprenterCallback(payload, secret, "demo", secret).payloadHash);
});

test("Shoprenter callback rejects forged tokens and a cross-shop payload", () => {
  assert.throws(() => verifyShoprenterCallback(payload, "wrong", "demo", secret), (error: unknown) => error instanceof ShoprenterWebhookError && error.code === "UNAUTHORIZED");
  assert.throws(() => verifyShoprenterCallback(payload, secret, "other-shop", secret), (error: unknown) => error instanceof ShoprenterWebhookError && error.code === "SHOP_MISMATCH");
});

test("Shoprenter callback rejects malformed and non-HUF orders", () => {
  assert.throws(() => verifyShoprenterCallback("{}", secret, "demo", secret), (error: unknown) => error instanceof ShoprenterWebhookError && error.code === "INVALID");
  const euro = payload.replace('"HUF"', '"EUR"');
  assert.throws(() => verifyShoprenterCallback(euro, secret, "demo", secret), (error: unknown) => error instanceof ShoprenterWebhookError && error.code === "INVALID");
});
