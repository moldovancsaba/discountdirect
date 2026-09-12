import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose documents are normalized at this boundary. */
import { createHash, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { BuyerRelationship, Membership, Seller, User } from "@/auth/models";
import { connectDatabase } from "@/lib/database";
import { recordInboundBuyerMessage } from "@/messaging/service";
import { mayDeliverMarketing } from "@/privacy/service";
import {
  deliveryIdFromAddresses,
  emailTransportReadiness,
  getResendReceivedEmail,
  inboundMessageBody,
  payloadHash,
  recipientAllowedByStage,
  sendResendEmail,
  unsubscribeUrl,
  verifyResendWebhook,
  verifyUnsubscribeToken,
  type EmailTransportConfig,
  configuredUnsubscribeSecret,
} from "./email";
import { DeliveryEvent, DeliveryOutbox, DeliverySuppression, DeliveryWebhookEvent } from "./models";

export class DeliveryError extends Error {
  code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT" | "UNAVAILABLE";

  constructor(code: DeliveryError["code"]) {
    super(code);
    this.code = code;
  }
}

type DeliveryChannel = "email" | "postal";
type DeliveryKind = "personal_offer" | "flash_campaign" | "automated_list" | "printable_letter";
type DeliveryStatus = "queued" | "processing" | "sent" | "unsupported" | "suppressed" | "retryable_failed" | "cancelled" | "bounced" | "complained";
type SuppressionReason = "unsubscribe" | "objection" | "hard_bounce" | "complaint" | "provider_suppression";
type FetchLike = typeof fetch;

const LOCK_MS = 2 * 60 * 1000;
const WORKER_ID = `delivery-${process.pid}-${randomUUID()}`;
const money = new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 });

function transportState(channel: DeliveryChannel) {
  if (channel === "email") {
    const config = emailTransportReadiness();
    return config.enabled ? { status: "queued" as const, reasonCode: "READY_FOR_RESEND" } : { status: "unsupported" as const, reasonCode: config.reasonCode };
  }
  const configured = process.env.POSTAL_DELIVERY_PROVIDER;
  return configured ? { status: "queued" as const, reasonCode: "READY_FOR_CONFIGURED_TRANSPORT" } : { status: "unsupported" as const, reasonCode: "TRANSPORT_NOT_CONFIGURED" };
}

function output(row: any) {
  return {
    id: row._id.toString(),
    kind: row.kind,
    channel: row.channel,
    status: row.status,
    reasonCode: row.reasonCode,
    provider: row.provider ?? null,
    providerMessageId: row.providerMessageId ?? null,
    attemptCount: row.attemptCount,
    nextAttemptAt: row.nextAttemptAt ?? null,
    sentAt: row.sentAt ?? null,
    completedAt: row.completedAt ?? null,
    cancelledAt: row.cancelledAt ?? null,
    createdAt: row.createdAt,
    offerId: row.offerId?.toString?.() ?? null,
    campaignId: row.campaignId?.toString?.() ?? null,
    automationId: row.automationId?.toString?.() ?? null,
    automationRunId: row.automationRunId?.toString?.() ?? null,
    offerListId: row.offerListId?.toString?.() ?? null,
    contentSnapshot: row.contentSnapshot,
  };
}

async function sellerAccess(userId: string, sellerSlug: string) {
  await connectDatabase();
  const seller = await Seller.findOne({ slug: sellerSlug, status: "active" }).lean();
  if (!seller) throw new DeliveryError("NOT_FOUND");
  if (!await Membership.exists({ sellerId: seller._id, userId, status: "active" })) throw new DeliveryError("FORBIDDEN");
  return seller;
}

function suppressionCode(reason: string) {
  return `SUPPRESSED_${reason.toUpperCase()}`;
}

async function activeSuppression(sellerId: unknown, buyerUserId: unknown, channel: DeliveryChannel, session?: mongoose.ClientSession) {
  const query = DeliverySuppression.findOne({
    buyerUserId,
    channel,
    $or: [{ scope: "global" }, { scope: "seller", sellerId }],
  });
  if (session) query.session(session);
  return query.lean();
}

async function recordEvent(
  session: mongoose.ClientSession | null,
  input: { deliveryId: unknown; sellerId: unknown; status: DeliveryStatus; reasonCode: string; occurredAt: Date; actorUserId?: unknown },
) {
  const rows = [{ deliveryId: input.deliveryId, sellerId: input.sellerId, status: input.status, reasonCode: input.reasonCode, occurredAt: input.occurredAt, actorUserId: input.actorUserId ?? null }];
  if (session) await DeliveryEvent.create(rows, { session });
  else await DeliveryEvent.create(rows);
}

export async function createDeliveryRecord(session: mongoose.ClientSession, input: {
  sellerId: unknown;
  buyerUserId: unknown;
  customerId?: unknown;
  offerId?: unknown;
  campaignId?: unknown;
  automationId?: unknown;
  automationRunId?: unknown;
  offerListId?: unknown;
  kind: DeliveryKind;
  channel: DeliveryChannel;
  idempotencyKey: string;
  contentSnapshot: Record<string, unknown>;
  createdByUserId: unknown;
}) {
  const allowed = await mayDeliverMarketing(String(input.sellerId), String(input.buyerUserId), input.channel);
  const suppression = allowed ? await activeSuppression(input.sellerId, input.buyerUserId, input.channel, session) : null;
  const state = !allowed
    ? { status: "suppressed" as const, reasonCode: "NO_CURRENT_CHANNEL_CONSENT" }
    : suppression
      ? { status: "suppressed" as const, reasonCode: suppressionCode(String(suppression.reason)) }
      : transportState(input.channel);
  const now = new Date();
  const [row] = await DeliveryOutbox.create([{
    sellerId: input.sellerId,
    buyerUserId: input.buyerUserId,
    customerId: input.customerId ?? null,
    offerId: input.offerId ?? null,
    campaignId: input.campaignId ?? null,
    automationId: input.automationId ?? null,
    automationRunId: input.automationRunId ?? null,
    offerListId: input.offerListId ?? null,
    kind: input.kind,
    channel: input.channel,
    idempotencyKey: input.idempotencyKey,
    contentSnapshot: input.contentSnapshot,
    createdByUserId: input.createdByUserId,
    status: state.status,
    reasonCode: state.reasonCode,
    nextAttemptAt: state.status === "queued" ? now : null,
    completedAt: ["unsupported", "suppressed"].includes(state.status) ? now : null,
  }], { session });
  await recordEvent(session, { deliveryId: row._id, sellerId: input.sellerId, status: row.status, reasonCode: row.reasonCode, occurredAt: now, actorUserId: input.createdByUserId });
  return row;
}

export async function listSellerDeliveries(userId: string, sellerSlug: string) {
  const seller = await sellerAccess(userId, sellerSlug);
  const rows = await DeliveryOutbox.find({ sellerId: seller._id }).sort({ createdAt: -1, _id: -1 }).limit(100).lean();
  return { seller: { id: seller._id.toString(), name: seller.name, slug: seller.slug }, deliveries: rows.map(output) };
}

export async function buyerDeliveries(userId: string, sellerSlug?: string) {
  await connectDatabase();
  const filter: Record<string, unknown> = { buyerUserId: userId };
  if (sellerSlug) {
    const seller = await Seller.findOne({ slug: sellerSlug, status: "active" }).lean();
    if (!seller) throw new DeliveryError("NOT_FOUND");
    if (!await BuyerRelationship.exists({ sellerId: seller._id, buyerUserId: userId, status: "active" })) throw new DeliveryError("FORBIDDEN");
    filter.sellerId = seller._id;
  }
  const rows = await DeliveryOutbox.find(filter).sort({ createdAt: -1, _id: -1 }).limit(100).lean();
  return { deliveries: rows.map(output) };
}

export async function cancelBuyerDeliveries(session: mongoose.ClientSession, sellerId: unknown, buyerUserId: unknown, reasonCode: string, actorUserId: string) {
  const now = new Date();
  const rows = await DeliveryOutbox.find({ sellerId, buyerUserId, status: { $in: ["queued", "processing", "retryable_failed"] } }).session(session);
  for (const row of rows) {
    row.status = "cancelled";
    row.reasonCode = reasonCode;
    row.cancelledAt = now;
    row.nextAttemptAt = null;
    row.lockedUntil = null;
    row.lockedBy = null;
    await row.save({ session });
    await recordEvent(session, { deliveryId: row._id, sellerId, status: "cancelled", reasonCode, occurredAt: now, actorUserId });
  }
  return rows.length;
}

function htmlEscape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function composeEmail(row: any, seller: any, buyer: any, config: EmailTransportConfig) {
  const snapshot = row.contentSnapshot ?? {};
  const productName = typeof snapshot.productName === "string" ? snapshot.productName : "személyes ajánlat";
  const discountPct = Number.isFinite(Number(snapshot.discountPct)) ? `${Number(snapshot.discountPct)}% kedvezmény` : "egyedi kedvezmény";
  const price = Number.isFinite(Number(snapshot.priceHuf)) ? money.format(Number(snapshot.priceHuf)) : "az ajanlatban szereplo ar";
  const optOutUrl = unsubscribeUrl(row._id.toString(), config);
  const subject = `${seller.name}: uj DiscountDirect ajanlat`;
  const text = [
    `Kedves ${buyer.displayName}!`,
    `${seller.name} uj ajanlatot kuldott: ${productName}, ${discountPct}, ${price}.`,
    "Valaszolj erre az e-mailre, es a valaszod a DiscountDirect beszelgetesbe kerul.",
    `Leiratkozas: ${optOutUrl}`,
  ].join("\n\n");
  const html = `<p>Kedves ${htmlEscape(buyer.displayName)}!</p><p>${htmlEscape(seller.name)} uj ajanlatot kuldott: <strong>${htmlEscape(productName)}</strong>, ${htmlEscape(discountPct)}, ${htmlEscape(price)}.</p><p>Valaszolj erre az e-mailre, es a valaszod a DiscountDirect beszelgetesbe kerul.</p><p><a href="${htmlEscape(optOutUrl)}">Leiratkozas</a></p>`;
  return { subject, text, html };
}

function retryAt(attemptCount: number) {
  const minutes = Math.min(60, Math.max(5, 5 * 2 ** Math.max(0, attemptCount - 1)));
  return new Date(Date.now() + minutes * 60 * 1000);
}

function resendFailureReason(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/validation|domain|permission|restricted/i.test(message)) return "RESEND_SEND_REJECTED";
  if (/api_key|configuration|missing/i.test(message)) return "RESEND_CONFIGURATION_REJECTED";
  return "RESEND_SEND_FAILED";
}

async function finishDelivery(row: any, status: DeliveryStatus, reasonCode: string, extra: Record<string, unknown> = {}) {
  const now = new Date();
  await DeliveryOutbox.updateOne(
    { _id: row._id },
    { $set: { status, reasonCode, completedAt: ["sent", "unsupported", "suppressed", "cancelled", "bounced", "complained"].includes(status) ? now : null, nextAttemptAt: null, lockedUntil: null, lockedBy: null, ...extra } },
  );
  await recordEvent(null, { deliveryId: row._id, sellerId: row.sellerId, status, reasonCode, occurredAt: now });
  return { id: row._id.toString(), status, reasonCode };
}

async function retryDelivery(row: any, reasonCode: string) {
  const finalAttempt = row.attemptCount >= row.maxAttempts;
  const nextAttemptAt = finalAttempt ? null : retryAt(row.attemptCount);
  await DeliveryOutbox.updateOne(
    { _id: row._id },
    { $set: { status: "retryable_failed", reasonCode, nextAttemptAt, lockedUntil: null, lockedBy: null } },
  );
  await recordEvent(null, { deliveryId: row._id, sellerId: row.sellerId, status: "retryable_failed", reasonCode, occurredAt: new Date() });
  return { id: row._id.toString(), status: "retryable_failed" as const, reasonCode };
}

async function deliverLockedEmail(row: any, fetcher: FetchLike) {
  const config = emailTransportReadiness();
  if (!config.enabled) return retryDelivery(row, config.reasonCode);
  const [seller, buyer] = await Promise.all([Seller.findById(row.sellerId).lean(), User.findById(row.buyerUserId).lean()]);
  if (!seller || !buyer) return finishDelivery(row, "cancelled", "DELIVERY_PARTICIPANT_NOT_FOUND");
  if (!buyer.emailNormalized) return finishDelivery(row, "suppressed", "BUYER_EMAIL_MISSING");
  if (!await mayDeliverMarketing(String(row.sellerId), String(row.buyerUserId), "email")) return finishDelivery(row, "suppressed", "NO_CURRENT_CHANNEL_CONSENT");
  const suppression = await activeSuppression(row.sellerId, row.buyerUserId, "email");
  if (suppression) return finishDelivery(row, "suppressed", suppressionCode(String(suppression.reason)));
  if (!recipientAllowedByStage(config, buyer.emailNormalized)) return finishDelivery(row, "unsupported", "EMAIL_STAGED_RECIPIENT_NOT_ALLOWED");
  const content = composeEmail(row, seller, buyer, config);
  try {
    const result = await sendResendEmail(config, { deliveryId: row._id.toString(), sellerId: row.sellerId.toString(), to: buyer.emailNormalized, idempotencyKey: row.idempotencyKey, ...content }, fetcher);
    return finishDelivery(row, "sent", "RESEND_ACCEPTED", { provider: "resend", providerMessageId: result.id, sentAt: new Date(), lastProviderEventAt: new Date() });
  } catch (error) {
    return retryDelivery(row, resendFailureReason(error));
  }
}

export async function processDueDeliveries(limitValue = 20, fetcher: FetchLike = fetch) {
  await connectDatabase();
  const limit = Math.min(50, Math.max(1, Math.floor(limitValue)));
  const results = [];
  for (let index = 0; index < limit; index += 1) {
    const now = new Date();
    const row = await DeliveryOutbox.findOneAndUpdate(
      {
        channel: "email",
        status: { $in: ["queued", "retryable_failed"] },
        nextAttemptAt: { $lte: now },
        $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
      },
      {
        $set: { status: "processing", reasonCode: "DELIVERY_SEND_IN_PROGRESS", lastAttemptAt: now, lockedUntil: new Date(now.getTime() + LOCK_MS), lockedBy: WORKER_ID },
        $inc: { attemptCount: 1 },
      },
      { sort: { nextAttemptAt: 1, createdAt: 1, _id: 1 }, new: true, runValidators: true },
    );
    if (!row) break;
    await recordEvent(null, { deliveryId: row._id, sellerId: row.sellerId, status: "processing", reasonCode: "DELIVERY_SEND_IN_PROGRESS", occurredAt: now });
    results.push(await deliverLockedEmail(row, fetcher));
  }
  return { processed: results.length, results };
}

function eventType(event: { type?: unknown }) {
  return typeof event.type === "string" ? event.type : "";
}

function eventData(event: { data?: Record<string, unknown> }) {
  return event.data && typeof event.data === "object" ? event.data : {};
}

function providerMessageId(data: Record<string, unknown>) {
  for (const key of ["email_id", "emailId", "id", "message_id"]) {
    if (typeof data[key] === "string") return data[key] as string;
  }
  return null;
}

function occurredAt(event: { created_at?: unknown }, fallbackTimestamp: number) {
  const parsed = typeof event.created_at === "string" ? new Date(event.created_at) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed : new Date(fallbackTimestamp * 1000);
}

function clientRequestId(providerEventId: string) {
  return `email_${createHash("sha256").update(providerEventId).digest("hex").slice(0, 32)}`;
}

async function upsertSuppression(session: mongoose.ClientSession, delivery: any, reason: SuppressionReason, providerEventId: string, now: Date) {
  await DeliverySuppression.findOneAndUpdate(
    { scope: "seller", sellerId: delivery.sellerId, buyerUserId: delivery.buyerUserId, channel: "email" },
    { $set: { reason, sourceDeliveryId: delivery._id, provider: "resend", providerEventId }, $setOnInsert: { createdAt: now } },
    { upsert: true, session, runValidators: true },
  );
}

async function markProviderSuppression(input: { messageId: string | null; providerEventId: string; status: "bounced" | "complained" | "suppressed"; reasonCode: string; suppressionReason: SuppressionReason; occurredAt: Date }) {
  if (!input.messageId) return { action: "delivery_not_found", reasonCode: "WEBHOOK_MESSAGE_ID_MISSING", deliveryId: null, sellerId: null, providerMessageId: null };
  const delivery = await DeliveryOutbox.findOne({ provider: "resend", providerMessageId: input.messageId }).lean();
  if (!delivery) return { action: "delivery_not_found", reasonCode: "WEBHOOK_DELIVERY_NOT_FOUND", deliveryId: null, sellerId: null, providerMessageId: input.messageId };
  const database = await connectDatabase();
  await database.connection.transaction(async (session) => {
    await DeliveryOutbox.updateOne(
      { _id: delivery._id },
      { $set: { status: input.status, reasonCode: input.reasonCode, completedAt: input.occurredAt, lastProviderEventAt: input.occurredAt, nextAttemptAt: null, lockedUntil: null, lockedBy: null } },
      { session },
    );
    await upsertSuppression(session, delivery, input.suppressionReason, input.providerEventId, input.occurredAt);
    await recordEvent(session, { deliveryId: delivery._id, sellerId: delivery.sellerId, status: input.status, reasonCode: input.reasonCode, occurredAt: input.occurredAt });
  });
  return { action: input.status, reasonCode: input.reasonCode, deliveryId: delivery._id, sellerId: delivery.sellerId, providerMessageId: input.messageId };
}

async function inboundReceived(input: { config: EmailTransportConfig; data: Record<string, unknown>; providerEventId: string; messageId: string | null; fetcher: FetchLike }) {
  const metadataDeliveryId = deliveryIdFromAddresses(input.data.received_for, input.config.replyDomain) ?? deliveryIdFromAddresses(input.data.to, input.config.replyDomain);
  const metadataDelivery = metadataDeliveryId ? await DeliveryOutbox.findById(metadataDeliveryId).lean() : null;
  if (Array.isArray(input.data.attachments) && input.data.attachments.length > 0) {
    return { action: "attachment_rejected", reasonCode: "INBOUND_ATTACHMENT_REJECTED", deliveryId: metadataDelivery?._id ?? null, sellerId: metadataDelivery?.sellerId ?? null, providerMessageId: input.messageId };
  }
  if (!input.messageId && !input.data.text && !input.data.html) return { action: "delivery_not_found", reasonCode: "WEBHOOK_MESSAGE_ID_MISSING", deliveryId: null, sellerId: null, providerMessageId: null };
  const email = input.data.text || input.data.html ? input.data : await getResendReceivedEmail(input.config, input.messageId!, input.fetcher);
  const deliveryId = metadataDeliveryId ?? deliveryIdFromAddresses(email.received_for, input.config.replyDomain) ?? deliveryIdFromAddresses(email.to, input.config.replyDomain);
  if (!deliveryId || !mongoose.isValidObjectId(deliveryId)) return { action: "delivery_not_found", reasonCode: "INBOUND_DELIVERY_ID_MISSING", deliveryId: null, sellerId: null, providerMessageId: input.messageId };
  const delivery = await DeliveryOutbox.findOne({ _id: deliveryId, provider: "resend" }).lean();
  if (!delivery) return { action: "delivery_not_found", reasonCode: "WEBHOOK_DELIVERY_NOT_FOUND", deliveryId: null, sellerId: null, providerMessageId: input.messageId };
  const body = inboundMessageBody(email);
  if (!body) return { action: "inbound_rejected", reasonCode: "INBOUND_BODY_EMPTY", deliveryId: delivery._id, sellerId: delivery.sellerId, providerMessageId: input.messageId };
  await recordInboundBuyerMessage({ sellerId: delivery.sellerId, buyerUserId: delivery.buyerUserId, clientRequestId: clientRequestId(input.providerEventId), body });
  await DeliveryOutbox.updateOne({ _id: delivery._id }, { $set: { lastProviderEventAt: new Date() } });
  return { action: "inbound_message_created", reasonCode: "INBOUND_MESSAGE_CREATED", deliveryId: delivery._id, sellerId: delivery.sellerId, providerMessageId: input.messageId };
}

export async function handleResendWebhook(rawPayload: string, headers: Headers | Record<string, string | undefined>, fetcher: FetchLike = fetch) {
  const config = emailTransportReadiness();
  if (!config.enabled) throw new DeliveryError("UNAVAILABLE");
  const verified = verifyResendWebhook(rawPayload, headers, config.webhookSecret);
  const type = eventType(verified.payload);
  const data = eventData(verified.payload);
  const messageId = providerMessageId(data);
  const at = occurredAt(verified.payload, verified.timestamp);
  await connectDatabase();
  let webhookRow: any;
  try {
    const [row] = await DeliveryWebhookEvent.create([{
      provider: "resend",
      providerEventId: verified.providerEventId,
      providerMessageId: messageId,
      type: type || "unknown",
      action: "accepted",
      reasonCode: "WEBHOOK_ACCEPTED",
      payloadHash: payloadHash(rawPayload),
      occurredAt: at,
      processedAt: new Date(),
    }]);
    webhookRow = row;
  } catch (error: any) {
    if (error?.code === 11000) return { duplicate: true, action: "duplicate", reasonCode: "WEBHOOK_DUPLICATE" };
    throw error;
  }
  let outcome;
  if (type === "email.received") {
    outcome = await inboundReceived({ config, data, providerEventId: verified.providerEventId, messageId, fetcher });
  } else if (type === "email.bounced") {
    outcome = await markProviderSuppression({ messageId, providerEventId: verified.providerEventId, status: "bounced", reasonCode: "EMAIL_HARD_BOUNCE", suppressionReason: "hard_bounce", occurredAt: at });
  } else if (type === "email.complained") {
    outcome = await markProviderSuppression({ messageId, providerEventId: verified.providerEventId, status: "complained", reasonCode: "EMAIL_COMPLAINT", suppressionReason: "complaint", occurredAt: at });
  } else if (type === "email.suppressed") {
    outcome = await markProviderSuppression({ messageId, providerEventId: verified.providerEventId, status: "suppressed", reasonCode: "PROVIDER_SUPPRESSED", suppressionReason: "provider_suppression", occurredAt: at });
  } else {
    outcome = { action: "ignored", reasonCode: "WEBHOOK_EVENT_IGNORED", deliveryId: null, sellerId: null, providerMessageId: messageId };
  }
  await DeliveryWebhookEvent.updateOne(
    { _id: webhookRow._id },
    { $set: { action: outcome.action, reasonCode: outcome.reasonCode, deliveryId: outcome.deliveryId ?? null, sellerId: outcome.sellerId ?? null, providerMessageId: outcome.providerMessageId ?? messageId ?? null, processedAt: new Date() } },
  );
  return { duplicate: false, action: outcome.action, reasonCode: outcome.reasonCode };
}

export async function suppressDeliveryBuyer(deliveryId: string, token: string) {
  const secret = configuredUnsubscribeSecret();
  if (!secret) throw new DeliveryError("UNAVAILABLE");
  if (!mongoose.isValidObjectId(deliveryId) || !verifyUnsubscribeToken(deliveryId, token, secret)) throw new DeliveryError("INVALID");
  await connectDatabase();
  const delivery = await DeliveryOutbox.findById(deliveryId).lean();
  if (!delivery) throw new DeliveryError("NOT_FOUND");
  const database = await connectDatabase();
  const now = new Date();
  await database.connection.transaction(async (session) => {
    await upsertSuppression(session, delivery, "unsubscribe", `unsubscribe:${deliveryId}`, now);
    await DeliveryOutbox.updateOne(
      { _id: delivery._id },
      { $set: { status: "suppressed", reasonCode: "EMAIL_UNSUBSCRIBED", completedAt: now, nextAttemptAt: null, lockedUntil: null, lockedBy: null, lastProviderEventAt: now } },
      { session },
    );
    await recordEvent(session, { deliveryId: delivery._id, sellerId: delivery.sellerId, status: "suppressed", reasonCode: "EMAIL_UNSUBSCRIBED", occurredAt: now });
  });
  return { status: "suppressed", reasonCode: "EMAIL_UNSUBSCRIBED" };
}

export async function deliverySummary() {
  await connectDatabase();
  const rows = await DeliveryOutbox.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]);
  return Object.fromEntries(rows.map((row: { _id: string; count: number }) => [row._id, row.count])) as Record<string, number>;
}
