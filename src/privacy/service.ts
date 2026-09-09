import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose documents are normalized at this boundary. */
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { BuyerRelationship, Membership, Seller, User } from "@/auth/models";
import { connectDatabase } from "@/lib/database";
import { Customer, Purchase } from "@/purchases/models";
import { ChannelPreference, ConsentEvent, PrivacyExport, PrivacyRequest } from "./models";
import { isAllowedRequestTransition, MARKETING_CHANNELS, PRIVACY_NOTICE_VERSION, validatePreferenceInput, validatePrivacyRequestType, validateResolution } from "./validation";

export class PrivacyError extends Error {
  constructor(public code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT" | "UNAVAILABLE") { super(code); }
}

async function buyerContext(userId: string, sellerSlug: string) {
  await connectDatabase();
  const seller = await Seller.findOne({ slug: sellerSlug, status: "active" }).lean();
  if (!seller) throw new PrivacyError("NOT_FOUND");
  const relationship = await BuyerRelationship.findOne({ sellerId: seller._id, buyerUserId: userId, status: "active" }).lean();
  if (!relationship) throw new PrivacyError("FORBIDDEN");
  const user = await User.findById(userId).lean();
  if (!user) throw new PrivacyError("FORBIDDEN");
  const customer = await Customer.findOne({ sellerId: seller._id, emailNormalized: user.emailNormalized }).lean();
  return { seller, relationship, user, customer };
}

async function sellerContext(userId: string, sellerSlug: string) {
  await connectDatabase();
  const seller = await Seller.findOne({ slug: sellerSlug, status: "active" }).lean();
  if (!seller) throw new PrivacyError("NOT_FOUND");
  const membership = await Membership.findOne({ sellerId: seller._id, userId, status: "active" }).lean();
  if (!membership) throw new PrivacyError("FORBIDDEN");
  return { seller, membership };
}

function preferenceOutput(row: any) {
  return { channel: row.channel as "email" | "postal", subscribed: row.status === "subscribed", noticeVersion: row.noticeVersion, changedAt: row.changedAt };
}

function requestOutput(row: any) {
  return { id: row._id.toString(), type: row.type, status: row.status, requestedAt: row.requestedAt, startedAt: row.startedAt ?? null, completedAt: row.completedAt ?? null, failedAt: row.failedAt ?? null, resolution: row.resolution ?? null };
}

export async function buyerPrivacy(userId: string, sellerSlug: string) {
  const { seller, customer } = await buyerContext(userId, sellerSlug);
  const [preferences, requests] = await Promise.all([
    ChannelPreference.find({ sellerId: seller._id, buyerUserId: userId, purpose: "marketing" }).sort({ channel: 1 }).lean(),
    PrivacyRequest.find({ sellerId: seller._id, buyerUserId: userId }).sort({ requestedAt: -1, _id: -1 }).limit(20).lean(),
  ]);
  const byChannel = new Map(preferences.map((row) => [row.channel, preferenceOutput(row)]));
  return {
    seller: { id: seller._id.toString(), name: seller.name, slug: seller.slug },
    customerStatus: customer?.privacyStatus ?? "not_linked",
    noticeVersion: PRIVACY_NOTICE_VERSION,
    preferences: MARKETING_CHANNELS.map((channel) => byChannel.get(channel) ?? { channel, subscribed: false, noticeVersion: PRIVACY_NOTICE_VERSION, changedAt: null }),
    requests: requests.map(requestOutput),
  };
}

export async function updateBuyerPreferences(userId: string, sellerSlug: string, value: unknown) {
  let input;
  try { input = validatePreferenceInput(value); } catch { throw new PrivacyError("INVALID"); }
  const { seller, customer } = await buyerContext(userId, sellerSlug);
  if (customer && customer.privacyStatus !== "active" && (input.email || input.postal)) throw new PrivacyError("CONFLICT");
  const database = await connectDatabase();
  const now = new Date();
  await database.connection.transaction(async (session) => {
    for (const channel of MARKETING_CHANNELS) {
      const subscribed = input[channel];
      const status = subscribed ? "subscribed" : "unsubscribed";
      const current = await ChannelPreference.findOne({ sellerId: seller._id, buyerUserId: userId, channel, purpose: "marketing" }).session(session).lean();
      if (current?.status === status) continue;
      await ChannelPreference.findOneAndUpdate(
        { sellerId: seller._id, buyerUserId: userId, channel, purpose: "marketing" },
        { $set: { customerId: customer?._id ?? null, status, noticeVersion: PRIVACY_NOTICE_VERSION, changedAt: now } },
        { upsert: true, new: true, session, runValidators: true },
      );
      if (subscribed || current) {
        await ConsentEvent.create([{ sellerId: seller._id, buyerUserId: userId, customerId: customer?._id ?? null, channel, purpose: "marketing", action: subscribed ? "granted" : "withdrawn", noticeVersion: PRIVACY_NOTICE_VERSION, occurredAt: now, actorUserId: userId }], { session });
      }
    }
  });
  return buyerPrivacy(userId, sellerSlug);
}

export async function createPrivacyRequest(userId: string, sellerSlug: string, typeValue: unknown) {
  let type;
  try { type = validatePrivacyRequestType(typeValue); } catch { throw new PrivacyError("INVALID"); }
  const { seller, customer } = await buyerContext(userId, sellerSlug);
  const openKey = `${seller._id}:${userId}:${type}`;
  const existing = await PrivacyRequest.findOne({ openKey }).lean();
  if (existing) return requestOutput(existing);
  try {
    const row = await PrivacyRequest.create({ sellerId: seller._id, buyerUserId: userId, customerId: customer?._id ?? null, type, openKey, status: "requested", requestedAt: new Date() });
    return requestOutput(row.toObject());
  } catch (error: any) {
    if (error?.code === 11000) {
      const concurrent = await PrivacyRequest.findOne({ openKey }).lean();
      if (concurrent) return requestOutput(concurrent);
    }
    throw error;
  }
}

export async function sellerPrivacyRequests(userId: string, sellerSlug: string) {
  const { seller } = await sellerContext(userId, sellerSlug);
  const rows = await PrivacyRequest.find({ sellerId: seller._id }).sort({ requestedAt: -1, _id: -1 }).limit(100).populate("buyerUserId", "displayName emailNormalized").lean();
  return { seller: { id: seller._id.toString(), name: seller.name, slug: seller.slug }, requests: rows.map((row: any) => ({ ...requestOutput(row), buyerName: row.buyerUserId?.displayName ?? "Ismeretlen vásárló", buyerEmail: row.buyerUserId?.emailNormalized ?? "—" })) };
}

async function buildExportPayload(sellerId: unknown, buyerUserId: unknown, customerId: unknown, session: mongoose.ClientSession) {
  const [user, seller, customer, preferences, events, purchases] = await Promise.all([
    User.findById(buyerUserId).session(session).lean(),
    Seller.findById(sellerId).session(session).lean(),
    customerId ? Customer.findById(customerId).session(session).lean() : null,
    ChannelPreference.find({ sellerId, buyerUserId }).session(session).lean(),
    ConsentEvent.find({ sellerId, buyerUserId }).sort({ occurredAt: 1, _id: 1 }).session(session).lean(),
    customerId ? Purchase.find({ sellerId, customerId }).sort({ purchasedAt: 1, _id: 1 }).session(session).lean() : [],
  ]);
  return {
    generatedAt: new Date().toISOString(),
    seller: seller ? { id: seller._id.toString(), name: seller.name } : null,
    account: user ? { id: user._id.toString(), email: user.emailNormalized, displayName: user.displayName } : null,
    customer: customer ? { externalBuyerId: customer.externalBuyerId, email: customer.emailNormalized, displayName: customer.displayName, privacyStatus: customer.privacyStatus, sourceName: customer.sourceName } : null,
    preferences: preferences.map((row: any) => ({ channel: row.channel, purpose: row.purpose, status: row.status, noticeVersion: row.noticeVersion, changedAt: row.changedAt })),
    consentEvents: events.map((row: any) => ({ channel: row.channel, purpose: row.purpose, action: row.action, noticeVersion: row.noticeVersion, occurredAt: row.occurredAt })),
    purchases: purchases.map((row: any) => ({ orderId: row.orderId, lineId: row.lineId, productSku: row.productSku, productName: row.productNameSnapshot, purchasedAt: row.purchasedAt, quantity: row.quantity, totalHuf: row.totalHuf, status: row.status })),
  };
}

async function withdrawAll(sellerId: unknown, buyerUserId: unknown, customerId: unknown, actorUserId: string, session: mongoose.ClientSession) {
  const now = new Date();
  const subscribed = await ChannelPreference.find({ sellerId, buyerUserId, purpose: "marketing", status: "subscribed" }).session(session).lean();
  if (!subscribed.length) return;
  await ChannelPreference.updateMany({ sellerId, buyerUserId, purpose: "marketing", status: "subscribed" }, { $set: { status: "unsubscribed", noticeVersion: PRIVACY_NOTICE_VERSION, changedAt: now } }, { session });
  await ConsentEvent.create(subscribed.map((row: any) => ({ sellerId, buyerUserId, customerId, channel: row.channel, purpose: "marketing", action: "withdrawn", noticeVersion: PRIVACY_NOTICE_VERSION, occurredAt: now, actorUserId })), { session });
}

export async function advancePrivacyRequest(userId: string, sellerSlug: string, requestId: string, nextStatus: unknown, resolutionValue: unknown) {
  if (!mongoose.isValidObjectId(requestId) || typeof nextStatus !== "string") throw new PrivacyError("INVALID");
  let resolution;
  try { resolution = validateResolution(resolutionValue); } catch { throw new PrivacyError("INVALID"); }
  const { seller } = await sellerContext(userId, sellerSlug);
  const database = await connectDatabase();
  let result: any;
  await database.connection.transaction(async (session) => {
    const request = await PrivacyRequest.findOne({ _id: requestId, sellerId: seller._id }).session(session);
    if (!request) throw new PrivacyError("NOT_FOUND");
    if (request.status === nextStatus) { result = requestOutput(request.toObject()); return; }
    if (!isAllowedRequestTransition(request.status, nextStatus)) throw new PrivacyError("CONFLICT");
    const now = new Date();
    if (nextStatus === "processing") request.startedAt = now;
    if (nextStatus === "failed") request.failedAt = now;
    if (nextStatus === "completed") {
      if (request.type === "access_export") {
        const payload = await buildExportPayload(request.sellerId, request.buyerUserId, request.customerId, session);
        await PrivacyExport.findOneAndUpdate(
          { requestId: request._id },
          { $set: { sellerId: request.sellerId, buyerUserId: request.buyerUserId, payload, expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) } },
          { upsert: true, session, runValidators: true },
        );
      }
      if (request.type === "restriction") {
        if (request.customerId) await Customer.updateOne({ _id: request.customerId, sellerId: request.sellerId }, { $set: { privacyStatus: "restricted" } }, { session });
        await withdrawAll(request.sellerId, request.buyerUserId, request.customerId, userId, session);
      }
      if (request.type === "erasure") {
        if (request.customerId) {
          const anonymousId = `erased-${createHash("sha256").update(`${request.sellerId}:${request.customerId}`).digest("hex").slice(0, 24)}`;
          await Customer.updateOne({ _id: request.customerId, sellerId: request.sellerId }, { $set: { externalBuyerId: anonymousId, emailNormalized: null, displayName: "Törölt vásárló", privacyStatus: "erased", sourceName: "privacy-erasure" } }, { session });
        }
        await withdrawAll(request.sellerId, request.buyerUserId, request.customerId, userId, session);
        await BuyerRelationship.updateOne({ sellerId: request.sellerId, buyerUserId: request.buyerUserId }, { $set: { status: "revoked" } }, { session });
      }
      request.completedAt = now;
      request.openKey = null;
    }
    request.status = nextStatus;
    request.handledByUserId = userId;
    request.resolution = resolution;
    await request.save({ session });
    result = requestOutput(request.toObject());
  });
  return result;
}

export async function buyerPrivacyExport(userId: string, sellerSlug: string, requestId: string) {
  if (!mongoose.isValidObjectId(requestId)) throw new PrivacyError("INVALID");
  const { seller } = await buyerContext(userId, sellerSlug);
  const artifact = await PrivacyExport.findOne({ requestId, sellerId: seller._id, buyerUserId: userId, expiresAt: { $gt: new Date() } }).lean();
  if (!artifact) throw new PrivacyError("NOT_FOUND");
  return artifact.payload;
}

export async function mayDeliverMarketing(sellerId: string, buyerUserId: string, channel: "email" | "postal") {
  await connectDatabase();
  const [preference, customer] = await Promise.all([
    ChannelPreference.findOne({ sellerId, buyerUserId, channel, purpose: "marketing", status: "subscribed" }).lean(),
    User.findById(buyerUserId).lean().then((user) => user ? Customer.findOne({ sellerId, emailNormalized: user.emailNormalized, privacyStatus: "active" }).lean() : null),
  ]);
  return Boolean(preference && customer);
}
