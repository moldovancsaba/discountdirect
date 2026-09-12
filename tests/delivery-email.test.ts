import { createHmac } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deliveryIdFromAddresses,
  emailTransportReadiness,
  replyAddress,
  sendResendEmail,
  unsubscribeToken,
  verifyResendWebhook,
  verifyUnsubscribeToken,
  type EmailTransportConfig,
} from "../src/delivery/email.ts";

const config: EmailTransportConfig = {
  enabled: true,
  provider: "resend",
  apiKey: "re_test",
  from: "DiscountDirect <offers@example.com>",
  replyDomain: "reply.example.com",
  webhookSecret: "whsec_" + Buffer.from("test webhook secret").toString("base64"),
  unsubscribeSecret: "test unsubscribe secret",
  publicBaseUrl: "https://discountdirect.example",
  stagedRecipients: null,
};

function signedHeaders(payload: string, id = "msg_test", timestamp = 1_800_000_000) {
  const secret = Buffer.from(config.webhookSecret.slice("whsec_".length), "base64");
  const signature = createHmac("sha256", secret).update(`${id}.${timestamp}.${payload}`).digest("base64");
  return { "svix-id": id, "svix-timestamp": String(timestamp), "svix-signature": `v1,${signature}` };
}

test("email transport readiness stays disabled until every Resend setting is present", () => {
  assert.deepEqual(emailTransportReadiness({}), { enabled: false, provider: null, reasonCode: "TRANSPORT_NOT_CONFIGURED" });
  assert.deepEqual(emailTransportReadiness({ EMAIL_DELIVERY_PROVIDER: "resend" }), { enabled: false, provider: "resend", reasonCode: "EMAIL_TRANSPORT_CONFIGURATION_INCOMPLETE" });
  const ready = emailTransportReadiness({
    EMAIL_DELIVERY_PROVIDER: "resend",
    RESEND_API_KEY: "re_test",
    RESEND_FROM: "DiscountDirect <offers@example.com>",
    RESEND_REPLY_DOMAIN: "reply.example.com",
    RESEND_WEBHOOK_SECRET: config.webhookSecret,
    APP_URL: "https://discountdirect.example/",
    EMAIL_STAGED_RECIPIENTS: "buyer@example.com",
  });
  assert.equal(ready.enabled, true);
  assert.equal(ready.enabled ? ready.stagedRecipients?.has("buyer@example.com") : false, true);
});

test("Resend webhook verification rejects forged and replayed payloads", () => {
  const payload = JSON.stringify({ type: "email.received", data: { email_id: "email_1" } });
  const verified = verifyResendWebhook(payload, signedHeaders(payload), config.webhookSecret, 1_800_000_010_000);
  assert.equal(verified.providerEventId, "msg_test");
  assert.equal(verified.payload.type, "email.received");
  assert.throws(() => verifyResendWebhook(`${payload} `, signedHeaders(payload), config.webhookSecret, 1_800_000_010_000), /INVALID_WEBHOOK_SIGNATURE/);
  assert.throws(() => verifyResendWebhook(payload, signedHeaders(payload), config.webhookSecret, 1_800_001_000_000), /STALE_WEBHOOK_SIGNATURE/);
});

test("reply address and unsubscribe tokens are delivery-bound", () => {
  const deliveryId = "0123456789abcdef01234567";
  assert.equal(replyAddress(deliveryId, config.replyDomain), "reply+0123456789abcdef01234567@reply.example.com");
  assert.equal(deliveryIdFromAddresses(["Reply <reply+0123456789abcdef01234567@reply.example.com>"], config.replyDomain), deliveryId);
  const token = unsubscribeToken(deliveryId, config.unsubscribeSecret);
  assert.equal(verifyUnsubscribeToken(deliveryId, token, config.unsubscribeSecret), true);
  assert.equal(verifyUnsubscribeToken("111111111111111111111111", token, config.unsubscribeSecret), false);
});

test("Resend send request includes idempotency, reply routing and list-unsubscribe headers", async () => {
  const captured: Array<{ url: string; init: RequestInit }> = [];
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    captured.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify({ id: "email_provider_id" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const result = await sendResendEmail(config, {
    deliveryId: "0123456789abcdef01234567",
    sellerId: "seller_1",
    to: "buyer@example.com",
    subject: "Teszt ajanlat",
    text: "Teszt",
    html: "<p>Teszt</p>",
    idempotencyKey: "delivery:0123456789abcdef01234567",
  }, fetcher as typeof fetch);
  assert.equal(result.id, "email_provider_id");
  assert.equal(captured[0].url, "https://api.resend.com/emails");
  assert.equal((captured[0].init.headers as Record<string, string>)["Idempotency-Key"], "delivery:0123456789abcdef01234567");
  const body = JSON.parse(String(captured[0].init.body));
  assert.equal(body.reply_to, "reply+0123456789abcdef01234567@reply.example.com");
  assert.match(body.headers["List-Unsubscribe"], /deliveryId=0123456789abcdef01234567/);
});
