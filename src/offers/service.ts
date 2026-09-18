import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose documents are normalized at this boundary. */
import mongoose from "mongoose";
import { BuyerRelationship, Membership, Seller } from "@/auth/models";
import { connectDatabase } from "@/lib/database";
import { Conversation, ConversationEvent } from "@/messaging/models";
import { maySendMarketing } from "@/consent/service";
import { RecommendationPreview } from "@/recommendations/models";
import { recordRealtimeEvent } from "@/realtime/service";
import { Offer, OfferEvent } from "./models";
import { reserveFlashOffer, CampaignError } from "@/campaigns/service";
import { createDeliveryRecord } from "@/delivery/service";
import { issueCouponForAcceptedOffer } from "@/redemptions/service";

export class OfferError extends Error { constructor(public code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT" | "EXPIRED" | "SOLD_OUT") { super(code); } }
const MAX_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

function output(row: any) { return { id: row._id.toString(), product: { id: row.productId.toString(), sku: row.productSku, name: row.productName, version: row.productVersion }, reason: { code: row.reasonCode, text: row.reasonText, evidencePurchaseIds: row.evidencePurchaseIds.map((id: any) => id.toString()) }, campaignId: row.campaignId ? row.campaignId.toString() : null, channel: row.channel, originalHuf: row.originalHuf, discountPct: row.discountPct, priceHuf: row.priceHuf, status: row.status, expiresAt: row.expiresAt, decidedAt: row.decidedAt ?? null, version: row.version, createdAt: row.createdAt }; }
async function sellerContext(userId: string, sellerSlug: string) { await connectDatabase(); const seller = await Seller.findOne({ slug: sellerSlug, status: "active" }).lean(); if (!seller) throw new OfferError("NOT_FOUND"); if (!await Membership.exists({ sellerId: seller._id, userId, status: "active" })) throw new OfferError("FORBIDDEN"); return seller; }
function createInput(input: unknown) { if (!input || typeof input !== "object") throw new OfferError("INVALID"); const value = input as Record<string, unknown>; if (!mongoose.isValidObjectId(value.previewId) || !mongoose.isValidObjectId(value.productId) || !Number.isInteger(value.discountPct) || Number(value.discountPct) < 0 || Number(value.discountPct) > 100 || typeof value.clientRequestId !== "string" || !/^[A-Za-z0-9_-]{8,120}$/.test(value.clientRequestId) || typeof value.expiresAt !== "string") throw new OfferError("INVALID"); const expiresAt = new Date(value.expiresAt); if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date() || expiresAt.getTime() > Date.now() + MAX_EXPIRY_MS) throw new OfferError("INVALID"); return { previewId: String(value.previewId), productId: String(value.productId), discountPct: Number(value.discountPct), clientRequestId: value.clientRequestId, expiresAt }; }

function offerThreadPreview(row: any, eventType: "created" | "accepted" | "declined" | "expired" | "cancelled") {
  const price = new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 }).format(row.priceHuf);
  if (eventType === "created") return `Ajánlat: ${row.productName}, ${row.discountPct}% kedvezmény, ${price}`;
  if (eventType === "accepted") return `Ajánlat elfogadva: ${row.productName}`;
  if (eventType === "declined") return `Ajánlat elutasítva: ${row.productName}`;
  if (eventType === "expired") return `Ajánlat lejárt: ${row.productName}`;
  return `Ajánlat lezárva: ${row.productName}`;
}

async function activeBuyerSellerIds(userId: string) {
  const rows = await BuyerRelationship.find({ buyerUserId: userId, status: "active" }).select({ sellerId: 1 }).lean();
  return rows.map((row) => row.sellerId);
}

export async function createOffer(userId: string, sellerSlug: string, input: unknown) {
  const value = createInput(input); const seller = await sellerContext(userId, sellerSlug);
  const existing = await Offer.findOne({ sellerId: seller._id, createdByUserId: userId, clientRequestId: value.clientRequestId }).lean(); if (existing) return output(existing);
  const preview = await RecommendationPreview.findOne({ _id: value.previewId, sellerId: seller._id, status: "eligible" }).lean();
  if (!preview?.buyerUserId) throw new OfferError("NOT_FOUND");
  const recommendation = preview.recommendations.find((item: any) => item.productId.toString() === value.productId);
  const sendDecision = await maySendMarketing(seller._id.toString(), preview.buyerUserId.toString(), preview.channel);
  if (!recommendation || !await BuyerRelationship.exists({ sellerId: seller._id, buyerUserId: preview.buyerUserId, status: "active" }) || !sendDecision.allowed) throw new OfferError("FORBIDDEN");
  const database = await connectDatabase(); let result: any;
  try {
    await database.connection.transaction(async (session) => {
      const conversation = await Conversation.findOne({ sellerId: seller._id, buyerUserId: preview.buyerUserId }).session(session);
      const priceHuf = Math.round(recommendation.priceHuf * (100 - value.discountPct) / 100);
      const now = new Date();
      const [row] = await Offer.create([{ sellerId: seller._id, buyerUserId: preview.buyerUserId, customerId: preview.customerId, conversationId: conversation?._id ?? null, recommendationPreviewId: preview._id, channel: preview.channel, productId: recommendation.productId, productSku: recommendation.productSku, productName: recommendation.productName, productVersion: recommendation.productVersion, reasonCode: recommendation.reasonCode, reasonText: recommendation.reasonText, evidencePurchaseIds: recommendation.evidencePurchaseIds, originalHuf: recommendation.priceHuf, discountPct: value.discountPct, priceHuf, expiresAt: value.expiresAt, clientRequestId: value.clientRequestId, createdByUserId: userId }], { session });
      await OfferEvent.create([{ offerId: row._id, sellerId: seller._id, type: "created", version: row.version, occurredAt: now, actorUserId: userId }], { session });
      const deliverySnapshot = { productName: row.productName, priceHuf: row.priceHuf, discountPct: row.discountPct, expiresAt: row.expiresAt };
      await createDeliveryRecord(session, { sellerId: seller._id, buyerUserId: preview.buyerUserId, customerId: preview.customerId, offerId: row._id, kind: "personal_offer", channel: "in_app", idempotencyKey: `offer:${row._id}:in_app`, contentSnapshot: deliverySnapshot, createdByUserId: userId });
      await createDeliveryRecord(session, { sellerId: seller._id, buyerUserId: preview.buyerUserId, customerId: preview.customerId, offerId: row._id, kind: "personal_offer", channel: preview.channel, idempotencyKey: `offer:${row._id}:${preview.channel}`, contentSnapshot: deliverySnapshot, createdByUserId: userId });
      if (conversation) {
        const previewText = offerThreadPreview(row, "created");
        await ConversationEvent.create([{ conversationId: conversation._id, sellerId: seller._id, kind: "offer", senderRole: "seller", senderUserId: userId, body: previewText, offerId: row._id, offerEventType: "created", createdAt: now }], { session });
        const updated = await Conversation.findOneAndUpdate({ _id: conversation._id, sellerId: seller._id }, { $set: { lastEventAt: now, lastEventPreview: previewText.slice(0, 240) }, $inc: { pendingOfferCount: 1, buyerUnreadCount: 1, version: 1 } }, { new: true, session });
        if (updated) await recordRealtimeEvent(session, { sellerId: seller._id, conversationId: conversation._id, type: "offer.updated", version: updated.version, occurredAt: now });
      }
      result = output(row.toObject());
    });
    return result;
  } catch (error: any) {
    if (error?.code === 11000) {
      const replay = await Offer.findOne({ sellerId: seller._id, createdByUserId: userId, clientRequestId: value.clientRequestId }).lean();
      if (replay) return output(replay);
    }
    throw error;
  }
}

export async function buyerOffers(userId: string) { await connectDatabase(); const sellerIds = await activeBuyerSellerIds(userId); if (!sellerIds.length) return { offers: [] }; const now = new Date(); await Offer.updateMany({ sellerId: { $in: sellerIds }, buyerUserId: userId, status: "pending", expiresAt: { $lte: now } }, { $set: { status: "expired", decidedAt: now }, $inc: { version: 1 } }); const rows = await Offer.find({ sellerId: { $in: sellerIds }, buyerUserId: userId }).sort({ expiresAt: 1, _id: 1 }).limit(100).lean(); return { offers: rows.map(output) }; }
export async function respondToOffer(userId: string, offerId: string, expectedVersion: unknown, decision: unknown) {
  if (!mongoose.isValidObjectId(offerId) || !Number.isInteger(expectedVersion) || !["accepted", "declined"].includes(String(decision))) throw new OfferError("INVALID");
  const database = await connectDatabase();
  const sellerIds = await activeBuyerSellerIds(userId);
  if (!sellerIds.length) throw new OfferError("NOT_FOUND");
  let result: any;
  try {
    await database.connection.transaction(async (session) => {
      const row = await Offer.findOne({ _id: offerId, sellerId: { $in: sellerIds }, buyerUserId: userId }).session(session);
      if (!row) throw new OfferError("NOT_FOUND");
      if (row.buyerUserId.toString() !== userId || !await BuyerRelationship.exists({ sellerId: row.sellerId, buyerUserId: userId, status: "active" })) throw new OfferError("FORBIDDEN");
      if (row.status === decision) { result = output(row.toObject()); return; }
      const now = new Date();
      if (row.status !== "pending" || row.version !== expectedVersion) throw new OfferError("CONFLICT");
      if (row.expiresAt <= now) {
        row.status = "expired";
        row.decidedAt = now;
        row.version += 1;
        await row.save({ session });
        await OfferEvent.create([{ offerId: row._id, sellerId: row.sellerId, type: "expired", version: row.version, occurredAt: now, actorUserId: userId }], { session });
        if (row.conversationId) {
          const previewText = offerThreadPreview(row, "expired");
          await ConversationEvent.create([{ conversationId: row.conversationId, sellerId: row.sellerId, kind: "offer", senderRole: "system", body: previewText, offerId: row._id, offerEventType: "expired", createdAt: now }], { session });
          const conversation = await Conversation.findOneAndUpdate({ _id: row.conversationId, sellerId: row.sellerId }, { $set: { lastEventAt: now, lastEventPreview: previewText.slice(0, 240) }, $inc: { pendingOfferCount: -1, sellerUnreadCount: 1, version: 1 } }, { new: true, session });
          if (conversation) await recordRealtimeEvent(session, { sellerId: row.sellerId, conversationId: conversation._id, type: "offer.updated", version: conversation.version, occurredAt: now });
        }
        throw new OfferError("EXPIRED");
      }
      if (decision === "accepted" && row.campaignId) await reserveFlashOffer(session, row, now);
      row.status = String(decision);
      row.decidedAt = now;
      row.decisionByUserId = userId;
      row.version += 1;
      await row.save({ session });
      await OfferEvent.create([{ offerId: row._id, sellerId: row.sellerId, type: decision, version: row.version, occurredAt: now, actorUserId: userId }], { session });
      if (decision === "accepted") await issueCouponForAcceptedOffer(session, row, userId, now);
      if (row.conversationId) {
        const offerEventType = decision as "accepted" | "declined";
        const previewText = offerThreadPreview(row, offerEventType);
        await ConversationEvent.create([{ conversationId: row.conversationId, sellerId: row.sellerId, kind: "offer", senderRole: "buyer", senderUserId: userId, body: previewText, offerId: row._id, offerEventType, createdAt: now }], { session });
        const conversation = await Conversation.findOneAndUpdate({ _id: row.conversationId, sellerId: row.sellerId }, { $set: { lastEventAt: now, lastEventPreview: previewText.slice(0, 240) }, $inc: { pendingOfferCount: -1, sellerUnreadCount: 1, version: 1 } }, { new: true, session });
        if (conversation) await recordRealtimeEvent(session, { sellerId: row.sellerId, conversationId: conversation._id, type: "offer.updated", version: conversation.version, occurredAt: now });
      }
      result = output(row.toObject());
    });
    return result;
  } catch (error) {
    if (error instanceof CampaignError && error.code === "SOLD_OUT") throw new OfferError("SOLD_OUT");
    throw error;
  }
}
