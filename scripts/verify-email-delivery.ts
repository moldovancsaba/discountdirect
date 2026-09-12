import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import mongoose from "mongoose";
import { authModels, BuyerRelationship, Membership, Seller, User } from "../src/auth/models.ts";
import { Customer, purchaseModels } from "../src/purchases/models.ts";
import { ChannelPreference, privacyModels } from "../src/privacy/models.ts";
import { Conversation, ConversationEvent, messagingModels } from "../src/messaging/models.ts";
import { realtimeModels } from "../src/realtime/models.ts";
import { DeliveryEvent, DeliveryOutbox, DeliverySuppression, deliveryModels } from "../src/delivery/models.ts";
import { replyAddress, unsubscribeToken } from "../src/delivery/email.ts";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is required");

const databaseName = `discountdirect_email_verify_${randomBytes(5).toString("hex")}`;
const appPort = 31_700 + Math.floor(Math.random() * 500);
const appBase = `http://127.0.0.1:${appPort}`;
const cronSecret = `email-cron-${randomBytes(24).toString("hex")}`;
const webhookSecret = `whsec_${Buffer.from("email webhook verification secret").toString("base64")}`;
const unsubscribeSecret = `email-unsubscribe-${randomBytes(18).toString("hex")}`;
const replyDomain = "reply.example.test";
const providerMessageId = "email_provider_verify_1";
const receivedEmailId = "email_received_verify_1";
const buyerEmail = "email.verify.buyer@example.test";
let deliveryReplyAddress = "";
type CapturedSend = { headers: IncomingMessage["headers"]; body: { reply_to?: string; [key: string]: unknown } };
const capturedSends: CapturedSend[] = [];

function readRequest(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

const resendServer = createServer(async (request, response) => {
  if (request.method === "POST" && request.url === "/emails") {
    const body = JSON.parse(await readRequest(request));
    capturedSends.push({ headers: request.headers, body });
    json(response, 200, { id: providerMessageId });
    return;
  }
  if (request.method === "GET" && request.url === `/emails/receiving/${receivedEmailId}`) {
    json(response, 200, { data: { to: [deliveryReplyAddress], text: "Ez egy ellenorzott inbound valasz.", attachments: [] } });
    return;
  }
  json(response, 404, { name: "not_found" });
});

function listen(server: ReturnType<typeof createServer>) {
  return new Promise<number>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert.ok(address && typeof address === "object");
      resolve(address.port);
    });
  });
}

function close(server: ReturnType<typeof createServer>) {
  return new Promise<void>((resolve) => server.close(() => resolve()));
}

function signedHeaders(payload: string, id: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const secret = Buffer.from(webhookSecret.slice("whsec_".length), "base64");
  const signature = createHmac("sha256", secret).update(`${id}.${timestamp}.${payload}`).digest("base64");
  return { "content-type": "application/json", "svix-id": id, "svix-timestamp": String(timestamp), "svix-signature": `v1,${signature}` };
}

async function waitUntilReady(serverOutput: () => string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(`${appBase}/api/health/live`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Verification server did not start: ${serverOutput().slice(-500)}`);
}

async function seedDelivery() {
  const passwordHash = "email verification does not sign in";
  const [sellerUser, buyerUser] = await User.create([
    { emailNormalized: "email.verify.seller@example.test", displayName: "Email Verification Seller", passwordHash, status: "active" },
    { emailNormalized: buyerEmail, displayName: "Email Verification Buyer", passwordHash, status: "active" },
  ]);
  const seller = await Seller.create({ name: "Email Verification Shop", slug: "email-verification-shop" });
  await Membership.create({ sellerId: seller._id, userId: sellerUser._id, role: "owner", status: "active" });
  await BuyerRelationship.create({ sellerId: seller._id, buyerUserId: buyerUser._id, status: "active" });
  const customer = await Customer.create({ sellerId: seller._id, externalBuyerId: "EMAIL-VERIFY-BUYER", emailNormalized: buyerEmail, displayName: "Email Verification Buyer", sourceName: "Email verification" });
  await ChannelPreference.create({ sellerId: seller._id, buyerUserId: buyerUser._id, customerId: customer._id, channel: "email", purpose: "marketing", status: "subscribed", noticeVersion: "privacy-hu-2026-09-09-v1", changedAt: new Date() });
  const conversation = await Conversation.create({ sellerId: seller._id, buyerUserId: buyerUser._id, customerId: customer._id, lastEventAt: new Date(), lastEventPreview: "Beszélgetés megnyitva" });
  await ConversationEvent.create({ conversationId: conversation._id, sellerId: seller._id, kind: "activity", senderRole: "system", activityType: "conversation_opened", createdAt: new Date() });
  const delivery = await DeliveryOutbox.create({
    sellerId: seller._id,
    buyerUserId: buyerUser._id,
    customerId: customer._id,
    kind: "personal_offer",
    channel: "email",
    status: "queued",
    reasonCode: "READY_FOR_RESEND",
    idempotencyKey: `email-verification:${randomBytes(8).toString("hex")}`,
    contentSnapshot: { productName: "Teszt termek", priceHuf: 4990, discountPct: 15 },
    nextAttemptAt: new Date(),
    createdByUserId: sellerUser._id,
  });
  await DeliveryEvent.create({ deliveryId: delivery._id, sellerId: seller._id, status: "queued", reasonCode: "READY_FOR_RESEND", occurredAt: new Date(), actorUserId: sellerUser._id });
  deliveryReplyAddress = replyAddress(delivery._id.toString(), replyDomain);
  return { seller, buyerUser, sellerUser, customer, conversation, delivery };
}

async function createQueuedDelivery(seed: Awaited<ReturnType<typeof seedDelivery>>, key: string) {
  const row = await DeliveryOutbox.create({
    sellerId: seed.seller._id,
    buyerUserId: seed.buyerUser._id,
    customerId: seed.customer._id,
    kind: "personal_offer",
    channel: "email",
    status: "queued",
    reasonCode: "READY_FOR_RESEND",
    idempotencyKey: key,
    contentSnapshot: { productName: "Masodik teszt termek", priceHuf: 7990, discountPct: 10 },
    nextAttemptAt: new Date(),
    createdByUserId: seed.sellerUser._id,
  });
  await DeliveryEvent.create({ deliveryId: row._id, sellerId: seed.seller._id, status: "queued", reasonCode: "READY_FOR_RESEND", occurredAt: new Date(), actorUserId: seed.sellerUser._id });
  return row;
}

const resendPort = await listen(resendServer);
const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(appPort)], {
  env: {
    ...process.env,
    MONGODB_DB: databaseName,
    CRON_SECRET: cronSecret,
    APP_URL: appBase,
    EMAIL_DELIVERY_PROVIDER: "resend",
    EMAIL_PUBLIC_BASE_URL: appBase,
    EMAIL_STAGED_RECIPIENTS: buyerEmail,
    EMAIL_UNSUBSCRIBE_SECRET: unsubscribeSecret,
    RESEND_API_KEY: "re_email_verification",
    RESEND_API_BASE_URL: `http://127.0.0.1:${resendPort}`,
    RESEND_FROM: "DiscountDirect <offers@example.test>",
    RESEND_REPLY_DOMAIN: replyDomain,
    RESEND_WEBHOOK_SECRET: webhookSecret,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
app.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
app.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

try {
  await mongoose.connect(uri, { dbName: databaseName, serverSelectionTimeoutMS: 5000, autoIndex: false });
  for (const dataModel of [...authModels, ...purchaseModels, ...privacyModels, ...messagingModels, ...realtimeModels, ...deliveryModels]) await dataModel.createIndexes();
  const seed = await seedDelivery();
  await waitUntilReady(() => serverOutput);

  const denied = await fetch(`${appBase}/api/cron/deliveries?limit=1`);
  assert.equal(denied.status, 401);

  const processed = await fetch(`${appBase}/api/cron/deliveries?limit=2`, { headers: { authorization: `Bearer ${cronSecret}` } });
  assert.equal(processed.status, 200);
  assert.equal((await processed.json()).processed, 1);
  assert.equal(capturedSends.length, 1);
  assert.equal(capturedSends[0].headers["idempotency-key"], seed.delivery.idempotencyKey);
  assert.equal(capturedSends[0].body.reply_to, deliveryReplyAddress);
  const sent = await DeliveryOutbox.findById(seed.delivery._id).lean();
  assert.equal(sent?.status, "sent");
  assert.equal(sent?.providerMessageId, providerMessageId);

  const inboundPayload = JSON.stringify({ type: "email.received", created_at: new Date().toISOString(), data: { email_id: receivedEmailId, to: [deliveryReplyAddress] } });
  const inbound = await fetch(`${appBase}/api/email/inbound`, { method: "POST", headers: signedHeaders(inboundPayload, "evt_inbound_verify"), body: inboundPayload });
  assert.equal(inbound.status, 200);
  assert.equal((await inbound.json()).action, "inbound_message_created");
  assert.equal(await ConversationEvent.countDocuments({ conversationId: seed.conversation._id, kind: "message", senderRole: "buyer" }), 1);

  const duplicate = await fetch(`${appBase}/api/email/inbound`, { method: "POST", headers: signedHeaders(inboundPayload, "evt_inbound_verify"), body: inboundPayload });
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).duplicate, true);
  assert.equal(await ConversationEvent.countDocuments({ conversationId: seed.conversation._id, kind: "message", senderRole: "buyer" }), 1);

  const forged = await fetch(`${appBase}/api/email/inbound`, { method: "POST", headers: signedHeaders(inboundPayload, "evt_forged_verify"), body: inboundPayload.replace("email.received", "email.bounced") });
  assert.equal(forged.status, 400);

  const bouncePayload = JSON.stringify({ type: "email.bounced", created_at: new Date().toISOString(), data: { email_id: providerMessageId } });
  const bounce = await fetch(`${appBase}/api/email/inbound`, { method: "POST", headers: signedHeaders(bouncePayload, "evt_bounce_verify"), body: bouncePayload });
  assert.equal(bounce.status, 200);
  assert.equal((await bounce.json()).action, "bounced");
  assert.equal((await DeliveryOutbox.findById(seed.delivery._id).lean())?.status, "bounced");
  assert.equal((await DeliverySuppression.findOne({ sellerId: seed.seller._id, buyerUserId: seed.buyerUser._id, channel: "email" }).lean())?.reason, "hard_bounce");

  const suppressedCandidate = await createQueuedDelivery(seed, `email-verification-suppressed:${randomBytes(8).toString("hex")}`);
  const suppressedRun = await fetch(`${appBase}/api/cron/deliveries?limit=1`, { headers: { authorization: `Bearer ${cronSecret}` } });
  assert.equal(suppressedRun.status, 200);
  assert.equal((await suppressedRun.json()).processed, 1);
  const suppressed = await DeliveryOutbox.findById(suppressedCandidate._id).lean();
  assert.equal(suppressed?.status, "suppressed");
  assert.equal(suppressed?.reasonCode, "SUPPRESSED_HARD_BOUNCE");
  assert.equal(capturedSends.length, 1);

  const token = unsubscribeToken(seed.delivery._id.toString(), unsubscribeSecret);
  const unsubscribed = await fetch(`${appBase}/api/email/unsubscribe?deliveryId=${seed.delivery._id}&token=${encodeURIComponent(token)}`);
  assert.equal(unsubscribed.status, 200);
  assert.equal((await DeliverySuppression.findOne({ sellerId: seed.seller._id, buyerUserId: seed.buyerUser._id, channel: "email" }).lean())?.reason, "unsubscribe");
  assert.equal((await DeliveryOutbox.findById(seed.delivery._id).lean())?.status, "suppressed");

  console.log("Email delivery integration passed: cron send, signed inbound reply, duplicate rejection, forged webhook rejection, bounce suppression, retry suppression and unsubscribe.");
} finally {
  app.kill("SIGTERM");
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.disconnect().catch(() => {});
  await close(resendServer).catch(() => {});
}
