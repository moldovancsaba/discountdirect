import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose documents are normalized at this boundary. */
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { Membership, Seller } from "@/auth/models";
import { connectDatabase } from "@/lib/database";
import { Offer } from "@/offers/models";
import { RedemptionCoupon, RedemptionEvent } from "./models";

export class RedemptionError extends Error {
  constructor(public code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT" | "EXPIRED") { super(code); }
}

function publicCode() {
  return `DD-${randomBytes(5).toString("hex").toUpperCase()}`;
}

function output(row: any) {
  return {
    id: row._id.toString(),
    offerId: row.offerId.toString(),
    campaignId: row.campaignId?.toString?.() ?? null,
    code: row.code,
    status: row.status,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    redeemedAt: row.redeemedAt ?? null,
    version: row.version,
  };
}

async function sellerAccess(userId: string, sellerSlug: string) {
  await connectDatabase();
  const seller = await Seller.findOne({ slug: sellerSlug, status: "active" }).lean();
  if (!seller) throw new RedemptionError("NOT_FOUND");
  if (!await Membership.exists({ sellerId: seller._id, userId, status: "active" })) throw new RedemptionError("FORBIDDEN");
  return seller;
}

export async function issueCouponForAcceptedOffer(session: mongoose.ClientSession, offer: any, actorUserId: string, now: Date) {
  if (offer.status !== "accepted") throw new RedemptionError("CONFLICT");
  const existing = await RedemptionCoupon.findOne({ offerId: offer._id }).session(session).lean();
  if (existing) return existing;
  let coupon: any;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const [created] = await RedemptionCoupon.create([{ sellerId: offer.sellerId, buyerUserId: offer.buyerUserId, customerId: offer.customerId, offerId: offer._id, campaignId: offer.campaignId ?? null, code: publicCode(), issuedAt: now, expiresAt: offer.expiresAt }], { session });
      coupon = created;
      break;
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
    }
  }
  if (!coupon) throw new RedemptionError("CONFLICT");
  await RedemptionEvent.create([{ couponId: coupon._id, sellerId: offer.sellerId, status: "issued", occurredAt: now, actorUserId }], { session });
  return coupon;
}

export async function buyerCoupons(userId: string) {
  await connectDatabase();
  const now = new Date();
  await RedemptionCoupon.updateMany({ buyerUserId: userId, status: "issued", expiresAt: { $lte: now } }, { $set: { status: "expired" }, $inc: { version: 1 } });
  const rows = await RedemptionCoupon.find({ buyerUserId: userId }).sort({ issuedAt: -1, _id: -1 }).limit(100).lean();
  const offerIds = rows.map((row) => row.offerId);
  const offers = await Offer.find({ _id: { $in: offerIds } }).lean();
  const offerById = new Map(offers.map((row: any) => [row._id.toString(), row]));
  return { coupons: rows.map((row: any) => ({ ...output(row), offer: offerById.get(row.offerId.toString()) ? { productName: offerById.get(row.offerId.toString()).productName, priceHuf: offerById.get(row.offerId.toString()).priceHuf } : null })) };
}

export async function sellerCoupons(userId: string, sellerSlug: string) {
  const seller = await sellerAccess(userId, sellerSlug);
  const rows = await RedemptionCoupon.find({ sellerId: seller._id }).sort({ issuedAt: -1, _id: -1 }).limit(100).lean();
  return { seller: { id: seller._id.toString(), name: seller.name, slug: seller.slug }, coupons: rows.map(output) };
}

export async function confirmRedemption(userId: string, sellerSlug: string, codeValue: unknown) {
  if (typeof codeValue !== "string" || !/^DD-[A-F0-9]{10}$/.test(codeValue.trim().toUpperCase())) throw new RedemptionError("INVALID");
  const seller = await sellerAccess(userId, sellerSlug);
  const database = await connectDatabase();
  let result: any;
  await database.connection.transaction(async (session) => {
    const code = codeValue.trim().toUpperCase();
    const coupon = await RedemptionCoupon.findOne({ sellerId: seller._id, code }).session(session);
    if (!coupon) throw new RedemptionError("NOT_FOUND");
    if (coupon.status === "redeemed") { result = output(coupon.toObject()); return; }
    if (coupon.status !== "issued") throw new RedemptionError("CONFLICT");
    const now = new Date();
    if (coupon.expiresAt <= now) {
      coupon.status = "expired";
      coupon.version += 1;
      await coupon.save({ session });
      await RedemptionEvent.create([{ couponId: coupon._id, sellerId: seller._id, status: "expired", occurredAt: now, actorUserId: userId }], { session });
      throw new RedemptionError("EXPIRED");
    }
    coupon.status = "redeemed";
    coupon.redeemedAt = now;
    coupon.redeemedByUserId = userId;
    coupon.version += 1;
    await coupon.save({ session });
    await RedemptionEvent.create([{ couponId: coupon._id, sellerId: seller._id, status: "redeemed", occurredAt: now, actorUserId: userId }], { session });
    result = output(coupon.toObject());
  });
  return result;
}

export async function redemptionSummary() {
  await connectDatabase();
  const rows = await RedemptionCoupon.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]);
  return Object.fromEntries(rows.map((row: { _id: string; count: number }) => [row._id, row.count])) as Record<string, number>;
}
