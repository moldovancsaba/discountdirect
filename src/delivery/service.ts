import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose documents are normalized at this boundary. */
import { createHash, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { BuyerRelationship, Membership, Seller, User } from "@/auth/models";
import { connectDatabase } from "@/lib/database";
import { withSellerTenant, withTenantBypass } from "@/lib/tenant";
import { recordInboundBuyerMessage } from "@/messaging/service";
import { maySendMarketing, recordMarketingSend } from "@/consent/service";
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

type OutboundDeliveryChannel = "email" | "postal" | "whatsapp" | "rcs";
type DeliveryChannel = "in_app" | OutboundDeliveryChannel;
type DeliveryKind = "personal_offer" | "flash_campaign" | "automated_list" | "printable_letter" | "journey_step";
type DeliveryStatus = "queued" | "processing" | "sent" | "unsupported" | "suppressed" | "retryable_failed" | "cancelled" | "bounced" | "complained";
type SuppressionReason = "unsubscribe" | "objection" | "hard_bounce" | "complaint" | "provider_suppression";
type FetchLike = typeof fetch;

const LOCK_MS = 2 * 60 * 1000;
const WORKER_ID = `delivery-${process.pid}-${randomUUID()}`;
const money = new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 });

function transportState(channel: DeliveryChannel) {
  if (channel === "in_app") return { status: "sent" as const, reasonCode: "IN_APP_THREAD_AVAILABLE" };
  if (channel === "email") {
    const config = emailTransportReadiness();
    return config.enabled ? { status: "queued" as const, reasonCode: "READY_FOR_RESEND" } : { status: "unsupported" as const, reasonCode: config.reasonCode };
  }
  if (channel === "whatsapp" || channel === "rcs") return { status: "unsupported" as const, reasonCode: `${channel.toUpperCase()}_PROVIDER_NOT_CONFIGURED` };
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

async function activeBuyerSellerIds(userId: string) {
  const rows = await BuyerRelationship.find({ buyerUserId: userId, status: "active" }).select({ sellerId: 1 }).lean();
  return rows.map((row) => row.sellerId);
}

function suppressionCode(reason: string) {
  return `SUPPRESSED_${reason.toUpperCase()}`;
}

async function activeSuppression(sellerId: unknown, buyerUserId: unknown, channel: OutboundDeliveryChannel, session?: mongoose.ClientSession) {
  return withTenantBypass("delivery-global-or-seller-suppression-check", async () => {
    const query = DeliverySuppression.findOne({
      buyerUserId,
      channel,
      $or: [{ scope: "global" }, { scope: "seller", sellerId }],
    });
    if (session) query.session(session);
    return await query.lean();
  });
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
  newsletterSnapshotId?: unknown;
  journeyDefinitionId?: unknown;
  journeyEnrollmentId?: unknown;
  journeyStepRunId?: unknown;
  kind: DeliveryKind;
  channel: DeliveryChannel;
  idempotencyKey: string;
  contentSnapshot: Record<string, unknown>;
  createdByUserId: unknown;
}) {
  let state: { status: DeliveryStatus; reasonCode: string };
  if (input.channel === "in_app") {
    state = transportState(input.channel);
  } else {
    const channel = input.channel;
    const decision = await maySendMarketing(String(input.sellerId), String(input.buyerUserId), channel);
    const suppression = decision.allowed ? await activeSuppression(input.sellerId, input.buyerUserId, channel, session) : null;
    state = !decision.allowed
      ? { status: "suppressed", reasonCode: decision.reasonCode }
      : suppression
        ? { status: "suppressed", reasonCode: suppressionCode(String(suppression.reason)) }
        : transportState(channel);
  }
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
    newsletterSnapshotId: input.newsletterSnapshotId ?? null,
    journeyDefinitionId: input.journeyDefinitionId ?? null,
    journeyEnrollmentId: input.journeyEnrollmentId ?? null,
    journeyStepRunId: input.journeyStepRunId ?? null,
    kind: input.kind,
    channel: input.channel,
    idempotencyKey: input.idempotencyKey,
    contentSnapshot: input.contentSnapshot,
    createdByUserId: input.createdByUserId,
    status: state.status,
    reasonCode: state.reasonCode,
    sentAt: state.status === "sent" ? now : null,
    nextAttemptAt: state.status === "queued" ? now : null,
    completedAt: ["sent", "unsupported", "suppressed"].includes(state.status) ? now : null,
  }], { session });
  await recordEvent(session, { deliveryId: row._id, sellerId: input.sellerId, status: row.status, reasonCode: row.reasonCode, occurredAt: now, actorUserId: input.createdByUserId });
  return row;
}

export async function listSellerDeliveries(userId: string, sellerSlug: string) {
  const seller = await sellerAccess(userId, sellerSlug);
  const rows = await DeliveryOutbox.find({ sellerId: seller._id }).sort({ createdAt: -1, _id: -1 }).limit(100).lean();
  return { seller: { id: seller._id.toString(), name: seller.name, slug: seller.slug }, deliveries: rows.map(output) };
}

export async function buyerDeliveries(userId: string) {
  await connectDatabase();
  const sellerIds = await activeBuyerSellerIds(userId);
  if (!sellerIds.length) return { deliveries: [] };
  const filter = { buyerUserId: userId, sellerId: { $in: sellerIds } };
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

export async function cancelJourneyDeliveries(session: mongoose.ClientSession, sellerId: unknown, journeyDefinitionId: unknown, reasonCode: string, actorUserId: string) {
  const now = new Date();
  const rows = await DeliveryOutbox.find({ sellerId, journeyDefinitionId, status: { $in: ["queued", "processing", "retryable_failed"] } }).session(session);
  for (const row of rows) {
    row.status = "cancelled"; row.reasonCode = reasonCode; row.cancelledAt = now; row.nextAttemptAt = null; row.lockedUntil = null; row.lockedBy = null;
    await row.save({ session });
    await recordEvent(session, { deliveryId: row._id, sellerId, status: "cancelled", reasonCode, occurredAt: now, actorUserId });
  }
  return rows.length;
}

function htmlEscape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderOfferEmail(row: any, seller: any, buyer: any, optOutUrl: string) {
  const snapshot = row.contentSnapshot ?? {};
  const productName = typeof snapshot.productName === "string" ? snapshot.productName : "személyes ajánlat";
  const discountPct = Number.isFinite(Number(snapshot.discountPct)) ? `${Number(snapshot.discountPct)}% kedvezmény` : "egyedi kedvezmény";
  const price = Number.isFinite(Number(snapshot.priceHuf)) ? money.format(Number(snapshot.priceHuf)) : "az ajánlatban szereplő ár";
  const referencePrice = Number.isFinite(Number(snapshot.referencePriceHuf)) ? money.format(Number(snapshot.referencePriceHuf)) : null;
  const referenceText = referencePrice ? ` A megelőző 30 nap legalacsonyabb ára: ${referencePrice}.` : "";
  const expiresAt = snapshot.expiresAt ? new Date(String(snapshot.expiresAt)) : null;
  const subject = row.kind === "flash_campaign" ? `${seller.name}: villámkampány ajánlat` : `${seller.name}: új személyes ajánlat`;
  const text = [
    `Kedves ${buyer.displayName}!`,
    `${seller.name} ajánlatot küldött: ${productName}, ${discountPct}, ${price}.${referenceText}`,
    expiresAt && Number.isFinite(expiresAt.getTime()) ? `Érvényes: ${expiresAt.toLocaleString("hu-HU", { timeZone: "Europe/Budapest" })}.` : "",
    "Válaszolj erre az e-mailre, és a válaszod a DiscountDirect beszélgetésbe kerül.",
    `Leiratkozás: ${optOutUrl}`,
  ].join("\n\n");
  const expiry = expiresAt && Number.isFinite(expiresAt.getTime()) ? `<p>Érvényes: ${htmlEscape(expiresAt.toLocaleString("hu-HU", { timeZone: "Europe/Budapest" }))}.</p>` : "";
  const html = `<p>Kedves ${htmlEscape(buyer.displayName)}!</p><p>${htmlEscape(seller.name)} ajánlatot küldött: <strong>${htmlEscape(productName)}</strong>, ${htmlEscape(discountPct)}, ${htmlEscape(price)}.${referencePrice ? ` A megelőző 30 nap legalacsonyabb ára: ${htmlEscape(referencePrice)}.` : ""}</p>${expiry}<p>Válaszolj erre az e-mailre, és a válaszod a DiscountDirect beszélgetésbe kerül.</p><p><a href="${htmlEscape(optOutUrl)}">Leiratkozás</a></p>`;
  return { subject, text, html };
}

function renderListEmail(row: any, seller: any, buyer: any, optOutUrl: string) {
  const snapshot = row.contentSnapshot ?? {};
  const title = typeof snapshot.title === "string" ? snapshot.title : "Személyre szabott ajánlatlista";
  const productCount = Number.isFinite(Number(snapshot.productCount)) ? Number(snapshot.productCount) : 0;
  const products = Array.isArray(snapshot.products) ? snapshot.products.slice(0, 10) : [];
  const availableUntil = snapshot.availableUntil ? new Date(String(snapshot.availableUntil)) : null;
  const lines = products.map((item: any) => {
    const name = typeof item.productName === "string" ? item.productName : "Ajánlott termék";
    const price = Number.isFinite(Number(item.priceHuf)) ? money.format(Number(item.priceHuf)) : "";
    const reason = typeof item.reasonText === "string" ? item.reasonText : "";
    return `- ${name}${price ? `, ${price}` : ""}${reason ? ` (${reason})` : ""}`;
  });
  const subject = `${seller.name}: ${title}`;
  const text = [
    `Kedves ${buyer.displayName}!`,
    `${seller.name} ${productCount} termékből álló ajánlatlistát készített neked.`,
    availableUntil && Number.isFinite(availableUntil.getTime()) ? `Elérhető: ${availableUntil.toLocaleString("hu-HU", { timeZone: "Europe/Budapest" })}.` : "",
    lines.length ? lines.join("\n") : "A lista részletei a DiscountDirect vásárlói felületen érhetők el.",
    `Leiratkozás: ${optOutUrl}`,
  ].join("\n\n");
  const htmlProducts = lines.length ? `<ul>${products.map((item: any) => `<li><strong>${htmlEscape(typeof item.productName === "string" ? item.productName : "Ajánlott termék")}</strong>${Number.isFinite(Number(item.priceHuf)) ? `, ${htmlEscape(money.format(Number(item.priceHuf)))}` : ""}${typeof item.reasonText === "string" ? `<br />${htmlEscape(item.reasonText)}` : ""}</li>`).join("")}</ul>` : "<p>A lista részletei a DiscountDirect vásárlói felületen érhetők el.</p>";
  const availability = availableUntil && Number.isFinite(availableUntil.getTime()) ? `<p>Elérhető: ${htmlEscape(availableUntil.toLocaleString("hu-HU", { timeZone: "Europe/Budapest" }))}.</p>` : "";
  const html = `<p>Kedves ${htmlEscape(buyer.displayName)}!</p><p>${htmlEscape(seller.name)} ${productCount} termékből álló ajánlatlistát készített neked.</p>${availability}${htmlProducts}<p><a href="${htmlEscape(optOutUrl)}">Leiratkozás</a></p>`;
  return { subject, text, html };
}

function renderJourneyEmail(row: any, seller: any, buyer: any, optOutUrl: string) {
  const title = typeof row.contentSnapshot?.title === "string" ? row.contentSnapshot.title : "Új üzenet";
  const subject = `${seller.name}: ${title}`;
  const text = [`Kedves ${buyer.displayName}!`, title, "A részleteket a DiscountDirect vásárlói felületén találod.", `Leiratkozás: ${optOutUrl}`].join("\n\n");
  const html = `<p>Kedves ${htmlEscape(buyer.displayName)}!</p><p><strong>${htmlEscape(title)}</strong></p><p>A részleteket a DiscountDirect vásárlói felületén találod.</p><p><a href="${htmlEscape(optOutUrl)}">Leiratkozás</a></p>`;
  return { subject, text, html };
}

function composeEmail(row: any, seller: any, buyer: any, config: EmailTransportConfig) {
  const optOutUrl = unsubscribeUrl(row._id.toString(), config);
  if (row.kind === "automated_list") return renderListEmail(row, seller, buyer, optOutUrl);
  if (row.kind === "journey_step") return renderJourneyEmail(row, seller, buyer, optOutUrl);
  const content = renderOfferEmail(row, seller, buyer, optOutUrl);
  if (row.kind === "printable_letter") return { ...content, subject: `${seller.name}: nyomtatható ajánlatlevél` };
  return content;
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
    { _id: row._id, sellerId: row.sellerId },
    { $set: { status, reasonCode, completedAt: ["sent", "unsupported", "suppressed", "cancelled", "bounced", "complained"].includes(status) ? now : null, nextAttemptAt: null, lockedUntil: null, lockedBy: null, ...extra } },
  );
  await recordEvent(null, { deliveryId: row._id, sellerId: row.sellerId, status, reasonCode, occurredAt: now });
  return { id: row._id.toString(), status, reasonCode };
}

async function retryDelivery(row: any, reasonCode: string) {
  const finalAttempt = row.attemptCount >= row.maxAttempts;
  const nextAttemptAt = finalAttempt ? null : retryAt(row.attemptCount);
  await DeliveryOutbox.updateOne(
    { _id: row._id, sellerId: row.sellerId },
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
  const decision = await maySendMarketing(String(row.sellerId), String(row.buyerUserId), "email");
  if (!decision.allowed) return finishDelivery(row, "suppressed", decision.reasonCode);
  const suppression = await activeSuppression(row.sellerId, row.buyerUserId, "email");
  if (suppression) return finishDelivery(row, "suppressed", suppressionCode(String(suppression.reason)));
  if (!recipientAllowedByStage(config, buyer.emailNormalized)) return finishDelivery(row, "unsupported", "EMAIL_STAGED_RECIPIENT_NOT_ALLOWED");
  const content = composeEmail(row, seller, buyer, config);
  try {
    const result = await sendResendEmail(config, { deliveryId: row._id.toString(), sellerId: row.sellerId.toString(), to: buyer.emailNormalized, idempotencyKey: row.idempotencyKey, ...content }, fetcher);
    const finished = await finishDelivery(row, "sent", "RESEND_ACCEPTED", { provider: "resend", providerMessageId: result.id, sentAt: new Date(), lastProviderEventAt: new Date() });
    await recordMarketingSend(String(row.sellerId), String(row.buyerUserId), "email");
    return finished;
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
    const row = await withTenantBypass(
      "delivery-cron-global-claim",
      async () => await DeliveryOutbox.findOneAndUpdate(
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
      ),
    );
    if (!row) break;
    results.push(await withSellerTenant(row.sellerId, async () => {
      await recordEvent(null, { deliveryId: row._id, sellerId: row.sellerId, status: "processing", reasonCode: "DELIVERY_SEND_IN_PROGRESS", occurredAt: now });
      return deliverLockedEmail(row, fetcher);
    }));
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
  const delivery = await withTenantBypass("resend-webhook-provider-message-lookup", async () =>
    await DeliveryOutbox.findOne({ provider: "resend", providerMessageId: input.messageId }).lean(),
  );
  if (!delivery) return { action: "delivery_not_found", reasonCode: "WEBHOOK_DELIVERY_NOT_FOUND", deliveryId: null, sellerId: null, providerMessageId: input.messageId };
  const database = await connectDatabase();
  await database.connection.transaction(async (session) => {
    await DeliveryOutbox.updateOne(
      { _id: delivery._id, sellerId: delivery.sellerId },
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
  const metadataDelivery = metadataDeliveryId ? await withTenantBypass("resend-inbound-metadata-delivery-lookup", async () => await DeliveryOutbox.findById(metadataDeliveryId).lean()) : null;
  if (Array.isArray(input.data.attachments) && input.data.attachments.length > 0) {
    return { action: "attachment_rejected", reasonCode: "INBOUND_ATTACHMENT_REJECTED", deliveryId: metadataDelivery?._id ?? null, sellerId: metadataDelivery?.sellerId ?? null, providerMessageId: input.messageId };
  }
  if (!input.messageId && !input.data.text && !input.data.html) return { action: "delivery_not_found", reasonCode: "WEBHOOK_MESSAGE_ID_MISSING", deliveryId: null, sellerId: null, providerMessageId: null };
  const email = input.data.text || input.data.html ? input.data : await getResendReceivedEmail(input.config, input.messageId!, input.fetcher);
  const deliveryId = metadataDeliveryId ?? deliveryIdFromAddresses(email.received_for, input.config.replyDomain) ?? deliveryIdFromAddresses(email.to, input.config.replyDomain);
  if (!deliveryId || !mongoose.isValidObjectId(deliveryId)) return { action: "delivery_not_found", reasonCode: "INBOUND_DELIVERY_ID_MISSING", deliveryId: null, sellerId: null, providerMessageId: input.messageId };
  const delivery = await withTenantBypass("resend-inbound-reply-delivery-lookup", async () =>
    await DeliveryOutbox.findOne({ _id: deliveryId, provider: "resend" }).lean(),
  );
  if (!delivery) return { action: "delivery_not_found", reasonCode: "WEBHOOK_DELIVERY_NOT_FOUND", deliveryId: null, sellerId: null, providerMessageId: input.messageId };
  const body = inboundMessageBody(email);
  if (!body) return { action: "inbound_rejected", reasonCode: "INBOUND_BODY_EMPTY", deliveryId: delivery._id, sellerId: delivery.sellerId, providerMessageId: input.messageId };
  await recordInboundBuyerMessage({ sellerId: delivery.sellerId, buyerUserId: delivery.buyerUserId, clientRequestId: clientRequestId(input.providerEventId), body });
  await DeliveryOutbox.updateOne({ _id: delivery._id, sellerId: delivery.sellerId }, { $set: { lastProviderEventAt: new Date() } });
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
    const [row] = await withTenantBypass("resend-webhook-event-ingest", async () =>
      await DeliveryWebhookEvent.create([{
        provider: "resend",
        providerEventId: verified.providerEventId,
        providerMessageId: messageId,
        type: type || "unknown",
        action: "accepted",
        reasonCode: "WEBHOOK_ACCEPTED",
        payloadHash: payloadHash(rawPayload),
        occurredAt: at,
        processedAt: new Date(),
      }]),
    );
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
  await withTenantBypass(
    "resend-webhook-event-finalize",
    async () => await DeliveryWebhookEvent.updateOne(
      { _id: webhookRow._id },
      { $set: { action: outcome.action, reasonCode: outcome.reasonCode, deliveryId: outcome.deliveryId ?? null, sellerId: outcome.sellerId ?? null, providerMessageId: outcome.providerMessageId ?? messageId ?? null, processedAt: new Date() } },
    ),
  );
  return { duplicate: false, action: outcome.action, reasonCode: outcome.reasonCode };
}

export async function suppressDeliveryBuyer(deliveryId: string, token: string) {
  const secret = configuredUnsubscribeSecret();
  if (!secret) throw new DeliveryError("UNAVAILABLE");
  if (!mongoose.isValidObjectId(deliveryId) || !verifyUnsubscribeToken(deliveryId, token, secret)) throw new DeliveryError("INVALID");
  await connectDatabase();
  const delivery = await withTenantBypass("unsubscribe-token-delivery-lookup", async () =>
    await DeliveryOutbox.findById(deliveryId).lean(),
  );
  if (!delivery) throw new DeliveryError("NOT_FOUND");
  const database = await connectDatabase();
  const now = new Date();
  await database.connection.transaction(async (session) => {
    await upsertSuppression(session, delivery, "unsubscribe", `unsubscribe:${deliveryId}`, now);
    await DeliveryOutbox.updateOne(
      { _id: delivery._id, sellerId: delivery.sellerId },
      { $set: { status: "suppressed", reasonCode: "EMAIL_UNSUBSCRIBED", completedAt: now, nextAttemptAt: null, lockedUntil: null, lockedBy: null, lastProviderEventAt: now } },
      { session },
    );
    await recordEvent(session, { deliveryId: delivery._id, sellerId: delivery.sellerId, status: "suppressed", reasonCode: "EMAIL_UNSUBSCRIBED", occurredAt: now });
  });
  return { status: "suppressed", reasonCode: "EMAIL_UNSUBSCRIBED" };
}

export async function deliverySummary() {
  await connectDatabase();
  const rows = await withTenantBypass("operator-delivery-summary", async () =>
    await DeliveryOutbox.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
  );
  return Object.fromEntries(rows.map((row: { _id: string; count: number }) => [row._id, row.count])) as Record<string, number>;
}

export async function deliveryChannelSummary() {
  await connectDatabase();
  const rows = await withTenantBypass("operator-delivery-channel-summary", async () =>
    await DeliveryOutbox.aggregate([{ $group: { _id: "$channel", count: { $sum: 1 } } }]),
  );
  return Object.fromEntries(rows.map((row: { _id: string; count: number }) => [row._id, row.count])) as Record<string, number>;
}
