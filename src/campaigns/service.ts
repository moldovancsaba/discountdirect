import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose documents are normalized at this boundary. */
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { BuyerRelationship, Membership, Seller } from "@/auth/models";
import { Product } from "@/catalog/models";
import { connectDatabase } from "@/lib/database";
import { Conversation, ConversationEvent } from "@/messaging/models";
import { Offer, OfferEvent } from "@/offers/models";
import { maySendMarketing } from "@/consent/service";
import { RecommendationPreview } from "@/recommendations/models";
import { recordRealtimeEvent } from "@/realtime/service";
import { Campaign, CampaignInventoryBalance, CampaignPreview, CampaignReservation } from "./models";
import { createDeliveryRecord } from "@/delivery/service";
import { discountDecision } from "@/pricing/service";
import { discountedPrice } from "@/pricing/reference-price";
import { productReferencePrice } from "@/pricing/reference-price-service";

export class CampaignError extends Error { constructor(public code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT" | "SOLD_OUT") { super(code); } }
const MAX_EXPIRY_MS = 48 * 60 * 60 * 1000;
const MAX_AUDIENCE = 100;

function campaignOutput(row: any, offeredCount?: number) { return { id: row._id.toString(), kind: row.kind, product: { id: row.productId.toString(), sku: row.productSku, name: row.productName, version: row.productVersion }, originalHuf: row.originalHuf, referencePriceHuf: row.referencePriceHuf ?? row.originalHuf, discountBaseHuf: row.discountBaseHuf ?? row.originalHuf, referencePriceWindowStart: row.referencePriceWindowStart ?? null, referencePriceCalculatedAt: row.referencePriceCalculatedAt ?? null, discountPct: row.discountPct, priceHuf: row.priceHuf, channel: row.channel, quantity: row.quantity, remaining: row.remaining, expiresAt: row.expiresAt, status: row.status, audienceSize: row.audienceSnapshot.length, offeredCount: offeredCount ?? undefined, createdAt: row.createdAt, cancelledAt: row.cancelledAt ?? null }; }
function campaignPreviewOutput(row: any) { return { id: row._id.toString(), kind: row.kind, product: { id: row.productId.toString(), sku: row.productSku, name: row.productName, version: row.productVersion }, originalHuf: row.originalHuf, referencePriceHuf: row.referencePriceHuf ?? row.originalHuf, discountBaseHuf: row.discountBaseHuf ?? row.originalHuf, referencePriceWindowStart: row.referencePriceWindowStart ?? null, referencePriceCalculatedAt: row.referencePriceCalculatedAt ?? null, discountPct: row.discountPct, priceHuf: row.priceHuf, channel: row.channel, quantity: row.quantity, expiresAt: row.expiresAt, status: row.status, audienceSize: row.audienceSnapshot.length, audience: row.audienceSnapshot.map((item: any) => ({ buyerUserId: item.buyerUserId.toString(), customerId: item.customerId.toString(), recommendationPreviewId: item.recommendationPreviewId.toString(), reasonCode: item.reasonCode, reasonText: item.reasonText, evidencePurchaseIds: item.evidencePurchaseIds.map((id: any) => id.toString()) })), launchedCampaignId: row.launchedCampaignId?.toString?.() ?? null, createdAt: row.createdAt, launchedAt: row.launchedAt ?? null }; }
async function sellerContext(userId: string, sellerSlug: string) { await connectDatabase(); const seller = await Seller.findOne({ slug: sellerSlug, status: "active" }).lean(); if (!seller) throw new CampaignError("NOT_FOUND"); if (!await Membership.exists({ sellerId: seller._id, userId, status: "active" })) throw new CampaignError("FORBIDDEN"); return seller; }
function previewInputFrom(input: unknown) { if (!input || typeof input !== "object") throw new CampaignError("INVALID"); const value = input as Record<string, unknown>; if (!mongoose.isValidObjectId(value.productId) || !Number.isInteger(value.discountPct) || Number(value.discountPct) < 0 || Number(value.discountPct) > 100 || !Number.isInteger(value.quantity) || Number(value.quantity) < 1 || Number(value.quantity) > 1000 || !["email", "postal"].includes(String(value.channel)) || typeof value.expiresAt !== "string") throw new CampaignError("INVALID"); const expiresAt = new Date(value.expiresAt); if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date() || expiresAt.getTime() > Date.now() + MAX_EXPIRY_MS) throw new CampaignError("INVALID"); return { productId: String(value.productId), discountPct: Number(value.discountPct), quantity: Number(value.quantity), channel: String(value.channel) as "email" | "postal", expiresAt }; }
function inputFrom(input: unknown) { if (!input || typeof input !== "object") throw new CampaignError("INVALID"); const value = input as Record<string, unknown>; if (typeof value.clientRequestId !== "string" || !/^[A-Za-z0-9_-]{8,120}$/.test(value.clientRequestId)) throw new CampaignError("INVALID"); return { ...previewInputFrom(input), clientRequestId: value.clientRequestId }; }

async function campaignAudience(sellerId: any, productId: string, channel: "email" | "postal", discountPct: number) {
  const previews = await RecommendationPreview.find({ sellerId, status: "eligible", channel, "recommendations.productId": productId, buyerUserId: { $ne: null } }).sort({ createdAt: -1, _id: -1 }).limit(500).lean();
  const audience: any[] = []; const seen = new Set<string>();
  for (const preview of previews) {
    const buyer = preview.buyerUserId?.toString(); if (!buyer || seen.has(buyer)) continue;
    const recommendation = preview.recommendations.find((item: any) => item.productId.toString() === productId); if (!recommendation) continue;
    const sendDecision = await maySendMarketing(sellerId.toString(), buyer, channel);
    const pricingDecision = await discountDecision(sellerId.toString(), buyer, discountPct);
    if (!await BuyerRelationship.exists({ sellerId, buyerUserId: preview.buyerUserId, status: "active" }) || !sendDecision.allowed || !pricingDecision.allowed) continue;
    seen.add(buyer); audience.push({ buyerUserId: preview.buyerUserId, customerId: preview.customerId, recommendationPreviewId: preview._id, reasonCode: recommendation.reasonCode, reasonText: recommendation.reasonText, evidencePurchaseIds: recommendation.evidencePurchaseIds });
    if (audience.length === MAX_AUDIENCE) break;
  }
  return audience;
}

function previewHash(input: ReturnType<typeof previewInputFrom>, product: any, audience: any[]) {
  return createHash("sha256").update(JSON.stringify({ input: { ...input, expiresAt: input.expiresAt.toISOString() }, product: [product._id.toString(), product.version, product.stock, product.active], audience: audience.map((item) => [item.buyerUserId.toString(), item.recommendationPreviewId.toString(), item.reasonCode]).sort() })).digest("hex");
}

function offerThreadPreview(row: any) {
  const price = new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 }).format(row.priceHuf);
  return `Villámkampány ajánlat: ${row.productName}, ${row.discountPct}% kedvezmény, ${price}`;
}

export async function createFlashCampaignPreview(userId: string, sellerSlug: string, input: unknown) {
  const value = previewInputFrom(input); const seller = await sellerContext(userId, sellerSlug);
  const calculatedAt = new Date();
  let reference;
  try { reference = await productReferencePrice(seller._id, value.productId, calculatedAt); } catch { throw new CampaignError("INVALID"); }
  const { product, evidence } = reference;
  if (product.stock < value.quantity) throw new CampaignError("INVALID");
  const audience = await campaignAudience(seller._id, value.productId, value.channel, value.discountPct); if (!audience.length) throw new CampaignError("CONFLICT");
  const calculatedPrice = discountedPrice(product.priceHuf, evidence, value.discountPct);
  const [preview] = await CampaignPreview.create([{ sellerId: seller._id, kind: "flash", productId: product._id, productSku: product.sku, productName: product.name, productVersion: product.version, originalHuf: product.priceHuf, referencePriceHuf: evidence.referencePriceHuf, discountBaseHuf: calculatedPrice.discountBaseHuf, referencePriceWindowStart: evidence.windowStart, referencePriceCalculatedAt: evidence.calculatedAt, referencePriceEvidenceVersions: evidence.evidenceVersions, discountPct: value.discountPct, priceHuf: calculatedPrice.priceHuf, channel: value.channel, quantity: value.quantity, expiresAt: value.expiresAt, audienceSnapshot: audience, inputHash: previewHash(value, product, audience), createdByUserId: userId }]);
  return campaignPreviewOutput(preview.toObject());
}

export async function getCampaignPreview(userId: string, sellerSlug: string, previewId: string) {
  const seller = await sellerContext(userId, sellerSlug);
  if (!mongoose.isValidObjectId(previewId)) throw new CampaignError("NOT_FOUND");
  const preview = await CampaignPreview.findOne({ _id: previewId, sellerId: seller._id }).lean();
  if (!preview) throw new CampaignError("NOT_FOUND");
  return campaignPreviewOutput(preview);
}

export async function launchFlashCampaignPreview(userId: string, sellerSlug: string, previewId: string, clientRequestId: unknown) {
  if (!mongoose.isValidObjectId(previewId) || typeof clientRequestId !== "string" || !/^[A-Za-z0-9_-]{8,120}$/.test(clientRequestId)) throw new CampaignError("INVALID");
  const seller = await sellerContext(userId, sellerSlug);
  const replay = await Campaign.findOne({ sellerId: seller._id, createdByUserId: userId, clientRequestId }).lean(); if (replay) return campaignOutput(replay, await Offer.countDocuments({ sellerId: seller._id, campaignId: replay._id }));
  const preview = await CampaignPreview.findOne({ _id: previewId, sellerId: seller._id }).lean();
  if (!preview) throw new CampaignError("NOT_FOUND");
  if (preview.launchedCampaignId) { const campaign = await Campaign.findOne({ _id: preview.launchedCampaignId, sellerId: seller._id }).lean(); if (campaign) return campaignOutput(campaign, await Offer.countDocuments({ sellerId: seller._id, campaignId: campaign._id })); }
  if (preview.status !== "ready" || preview.expiresAt <= new Date()) {
    if (preview.status === "ready") await CampaignPreview.updateOne({ _id: preview._id, sellerId: seller._id }, { $set: { status: "expired" } });
    throw new CampaignError("CONFLICT");
  }
  const product = await Product.findOne({ _id: preview.productId, sellerId: seller._id, active: true }).lean();
  if (!product || product.stock < preview.quantity || product.version !== preview.productVersion) throw new CampaignError("CONFLICT");
  const database = await connectDatabase(); let result: any;
  try { await database.connection.transaction(async (session) => {
    const campaignId = new mongoose.Types.ObjectId(); const now = new Date();
    const [campaign] = await Campaign.create([{ _id: campaignId, sellerId: seller._id, kind: "flash", productId: preview.productId, productSku: preview.productSku, productName: preview.productName, productVersion: preview.productVersion, originalHuf: preview.originalHuf, referencePriceHuf: preview.referencePriceHuf, discountBaseHuf: preview.discountBaseHuf, referencePriceWindowStart: preview.referencePriceWindowStart, referencePriceCalculatedAt: preview.referencePriceCalculatedAt, referencePriceEvidenceVersions: preview.referencePriceEvidenceVersions, discountPct: preview.discountPct, priceHuf: preview.priceHuf, channel: preview.channel, quantity: preview.quantity, remaining: preview.quantity, expiresAt: preview.expiresAt, audienceSnapshot: preview.audienceSnapshot, clientRequestId, createdByUserId: userId }], { session });
    await CampaignPreview.updateOne({ _id: preview._id, sellerId: seller._id, status: "ready" }, { $set: { status: "launched", launchedCampaignId: campaignId, launchedAt: now } }, { session });
    const conversations = await Conversation.find({ sellerId: seller._id, buyerUserId: { $in: preview.audienceSnapshot.map((item: any) => item.buyerUserId) } }).session(session).lean(); const conversationByBuyer = new Map(conversations.map((row: any) => [row.buyerUserId.toString(), row]));
    const offers = preview.audienceSnapshot.map((item: any) => { const conversation = conversationByBuyer.get(item.buyerUserId.toString()); return { sellerId: seller._id, buyerUserId: item.buyerUserId, customerId: item.customerId, conversationId: conversation?._id ?? null, campaignId, recommendationPreviewId: item.recommendationPreviewId, channel: preview.channel, productId: preview.productId, productSku: preview.productSku, productName: preview.productName, productVersion: preview.productVersion, reasonCode: item.reasonCode, reasonText: item.reasonText, evidencePurchaseIds: item.evidencePurchaseIds, originalHuf: preview.originalHuf, referencePriceHuf: preview.referencePriceHuf, discountBaseHuf: preview.discountBaseHuf, referencePriceWindowStart: preview.referencePriceWindowStart, referencePriceCalculatedAt: preview.referencePriceCalculatedAt, referencePriceEvidenceVersions: preview.referencePriceEvidenceVersions, discountPct: preview.discountPct, priceHuf: preview.priceHuf, expiresAt: preview.expiresAt, clientRequestId: `campaign_${campaignId}_${item.buyerUserId}`, createdByUserId: userId }; });
    const created = await Offer.create(offers, { session }); await OfferEvent.create(created.map((row: any) => ({ offerId: row._id, sellerId: seller._id, type: "created", version: row.version, occurredAt: now, actorUserId: userId })), { session });
    for (const row of created) {
      const contentSnapshot = { productName: row.productName, priceHuf: row.priceHuf, discountPct: row.discountPct, referencePriceHuf: row.referencePriceHuf, expiresAt: row.expiresAt, campaignId: campaignId.toString() };
      await createDeliveryRecord(session, { sellerId: seller._id, buyerUserId: row.buyerUserId, customerId: row.customerId, offerId: row._id, campaignId, kind: "flash_campaign", channel: "in_app", idempotencyKey: `campaign:${campaignId}:${row.buyerUserId}:in_app`, contentSnapshot, createdByUserId: userId });
      await createDeliveryRecord(session, { sellerId: seller._id, buyerUserId: row.buyerUserId, customerId: row.customerId, offerId: row._id, campaignId, kind: "flash_campaign", channel: preview.channel, idempotencyKey: `campaign:${campaignId}:${row.buyerUserId}:${preview.channel}`, contentSnapshot, createdByUserId: userId });
      if (row.conversationId) {
        const previewText = offerThreadPreview(row);
        await ConversationEvent.create([{ conversationId: row.conversationId, sellerId: seller._id, kind: "offer", senderRole: "seller", senderUserId: userId, body: previewText, offerId: row._id, offerEventType: "created", createdAt: now }], { session });
        const updated = await Conversation.findOneAndUpdate({ _id: row.conversationId, sellerId: seller._id }, { $set: { lastEventAt: now, lastEventPreview: previewText.slice(0, 240) }, $inc: { pendingOfferCount: 1, buyerUnreadCount: 1, version: 1 } }, { new: true, session });
        if (updated) await recordRealtimeEvent(session, { sellerId: seller._id, conversationId: updated._id, type: "offer.updated", version: updated.version, occurredAt: now });
      }
    }
    result = campaignOutput(campaign.toObject(), created.length);
  }); return result; } catch (error: any) { if (error?.code === 11000) { const existing = await Campaign.findOne({ sellerId: seller._id, createdByUserId: userId, clientRequestId }).lean(); if (existing) return campaignOutput(existing, await Offer.countDocuments({ sellerId: seller._id, campaignId: existing._id })); } throw error; }
}

export async function createFlashCampaign(userId: string, sellerSlug: string, input: unknown) {
  const value = inputFrom(input);
  const preview = await createFlashCampaignPreview(userId, sellerSlug, { ...value, expiresAt: value.expiresAt.toISOString() });
  return launchFlashCampaignPreview(userId, sellerSlug, preview.id, value.clientRequestId);
}

async function releaseReservations(session: mongoose.ClientSession, campaign: any, reason: "cancelled" | "expired", now: Date) { const active = await CampaignReservation.find({ sellerId: campaign.sellerId, campaignId: campaign._id, status: "reserved" }).session(session); for (const reservation of active) { reservation.status = "released"; reservation.releasedAt = now; reservation.releaseReason = reason; await reservation.save({ session }); } if (active.length) await CampaignInventoryBalance.updateOne({ sellerId: campaign.sellerId, productId: campaign.productId, reserved: { $gte: active.length } }, { $inc: { reserved: -active.length } }, { session }); campaign.remaining += active.length; return active.length; }
async function expireCampaignIfNeeded(campaignId: any, sellerId: any) { const database = await connectDatabase(); await database.connection.transaction(async (session) => { const campaign = await Campaign.findOne({ _id: campaignId, sellerId }).session(session); const now = new Date(); if (!campaign || campaign.status !== "active" || campaign.expiresAt > now) return; await releaseReservations(session, campaign, "expired", now); campaign.status = "expired"; await campaign.save({ session }); }); }
export async function listCampaigns(userId: string, sellerSlug: string) { const seller = await sellerContext(userId, sellerSlug); const initial = await Campaign.find({ sellerId: seller._id, status: "active", expiresAt: { $lte: new Date() } }).select({ _id: 1 }).lean(); for (const campaign of initial) await expireCampaignIfNeeded(campaign._id, seller._id); const rows = await Campaign.find({ sellerId: seller._id }).sort({ createdAt: -1, _id: -1 }).limit(50).lean(); return { seller: { id: seller._id.toString(), slug: seller.slug, name: seller.name }, campaigns: rows.map(campaignOutput) }; }
export async function getCampaign(userId: string, sellerSlug: string, campaignId: string) { const seller = await sellerContext(userId, sellerSlug); if (!mongoose.isValidObjectId(campaignId)) throw new CampaignError("NOT_FOUND"); const initial = await Campaign.findOne({ _id: campaignId, sellerId: seller._id }).lean(); if (!initial) throw new CampaignError("NOT_FOUND"); if (initial.status === "active" && initial.expiresAt <= new Date()) await expireCampaignIfNeeded(initial._id, seller._id); const row = await Campaign.findOne({ _id: initial._id, sellerId: seller._id }).lean(); if (!row) throw new CampaignError("NOT_FOUND"); return { campaign: campaignOutput(row, await Offer.countDocuments({ sellerId: seller._id, campaignId: row._id })), reservations: await CampaignReservation.countDocuments({ sellerId: seller._id, campaignId: row._id, status: "reserved" }) }; }

export async function reserveFlashOffer(session: mongoose.ClientSession, row: any, now: Date) {
  const campaign = await Campaign.findOne({ _id: row.campaignId, sellerId: row.sellerId }).session(session); if (!campaign || campaign.status !== "active") throw new CampaignError("SOLD_OUT"); if (campaign.expiresAt <= now) { await releaseReservations(session, campaign, "expired", now); campaign.status = "expired"; await campaign.save({ session }); throw new CampaignError("SOLD_OUT"); }
  const product = await Product.findOne({ _id: row.productId, sellerId: row.sellerId, active: true }).session(session); if (!product || product.stock < 1) throw new CampaignError("SOLD_OUT");
  await CampaignInventoryBalance.updateOne({ sellerId: row.sellerId, productId: row.productId }, { $setOnInsert: { reserved: 0 } }, { upsert: true, session });
  const balance = await CampaignInventoryBalance.findOneAndUpdate({ sellerId: row.sellerId, productId: row.productId, reserved: { $lt: product.stock } }, { $inc: { reserved: 1 } }, { new: true, session }); if (!balance) throw new CampaignError("SOLD_OUT");
  const updated = await Campaign.findOneAndUpdate({ _id: campaign._id, sellerId: row.sellerId, status: "active", remaining: { $gt: 0 }, expiresAt: { $gt: now } }, { $inc: { remaining: -1 } }, { new: true, session }); if (!updated) throw new CampaignError("SOLD_OUT");
  await CampaignReservation.create([{ campaignId: campaign._id, offerId: row._id, sellerId: row.sellerId, productId: row.productId, buyerUserId: row.buyerUserId }], { session });
}

export async function cancelCampaign(userId: string, sellerSlug: string, campaignId: string) {
  const seller = await sellerContext(userId, sellerSlug); if (!mongoose.isValidObjectId(campaignId)) throw new CampaignError("NOT_FOUND"); const database = await connectDatabase(); let result: any;
  await database.connection.transaction(async (session) => { const campaign = await Campaign.findOne({ _id: campaignId, sellerId: seller._id }).session(session); if (!campaign) throw new CampaignError("NOT_FOUND"); if (campaign.status === "cancelled") { result = campaignOutput(campaign.toObject()); return; } if (campaign.status !== "active") throw new CampaignError("CONFLICT"); const now = new Date(); await releaseReservations(session, campaign, "cancelled", now);
    campaign.status = "cancelled"; campaign.cancelledAt = now; await campaign.save({ session }); result = campaignOutput(campaign.toObject());
  }); return result;
}
