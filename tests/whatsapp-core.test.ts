import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { normalizeWhatsAppNumber, validateWhatsAppTemplate, verifyWhatsAppCallback, whatsappRetryable } from "../src/channels/whatsapp-core.ts";

test("WhatsApp adapter validates E.164 numbers and approved template variables", () => {
  assert.equal(normalizeWhatsAppNumber("+36 (30) 123-4567"), "+36301234567");
  assert.deepEqual(validateWhatsAppTemplate({ name: "offer_ready", language: "hu", variables: ["product"] }, { product: "Kávéfőző" }).variables, { product: "Kávéfőző" });
  assert.throws(() => normalizeWhatsAppNumber("0036301234567"), /WHATSAPP_NUMBER_INVALID/);
  assert.throws(() => validateWhatsAppTemplate({ name: "offer_ready", language: "hu", variables: ["product"] }, {}), /WHATSAPP_TEMPLATE_VARIABLES_INVALID/);
});

test("WhatsApp callback signatures are fresh and retry classification is bounded", () => {
  const payload = "{\"id\":\"evt-1\"}";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const secret = "s".repeat(32);
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  assert.equal(verifyWhatsAppCallback(payload, timestamp, signature, secret), true);
  assert.throws(() => verifyWhatsAppCallback(payload, timestamp, "0".repeat(64), secret), /WHATSAPP_CALLBACK_INVALID/);
  assert.equal(whatsappRetryable(429), true);
  assert.equal(whatsappRetryable(400), false);
});
