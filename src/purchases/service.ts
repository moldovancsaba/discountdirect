import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose documents are normalized at this boundary. */
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { connectDatabase } from "@/lib/database";
import { BuyerRelationship, Membership, Seller, User } from "@/auth/models";
import { Product } from "@/catalog/models";
import { ChannelPreference, ConsentEvent } from "@/privacy/models";
import { PRIVACY_NOTICE_VERSION } from "@/privacy/validation";
import { Customer, Purchase, PurchaseImportBatch } from "./models";
import { validatePurchaseInput, type PurchaseInput } from "./validation";

export class PurchaseError extends Error {
  constructor(public code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT" | "TOO_LARGE" | "STALE") { super(code); }
}

function validated(value: unknown) {
  try { return validatePurchaseInput(value); } catch { throw new PurchaseError("INVALID"); }
}

async function purchaseSellerAccess(userId: string, sellerSlug: string) {
  await connectDatabase();
  const seller = await Seller.findOne({ slug: sellerSlug, status: "active" }).lean();
  if (!seller) throw new PurchaseError("NOT_FOUND");
  const membership = await Membership.findOne({ sellerId: seller._id, userId, status: "active" }).lean();
  if (!membership) throw new PurchaseError("FORBIDDEN");
  return { seller, membership };
}

function rowChecksum(row: PurchaseInput) {
  return createHash("sha256").update(JSON.stringify({ ...row, purchasedAt: row.purchasedAt.toISOString() })).digest("hex");
}

function purchaseOutput(row: any) {
  return { id: row._id.toString(), orderId: row.orderId, lineId: row.lineId, productSku: row.productSku, productName: row.productNameSnapshot, purchasedAt: row.purchasedAt, quantity: row.quantity, totalHuf: row.totalHuf, status: row.status, correctionReason: row.correctionReason ?? null, version: row.version };
}

export async function previewPurchaseImport(userId: string, sellerSlug: string, value: unknown) {
  if (!value || typeof value !== "object") throw new PurchaseError("INVALID");
  const { schemaVersion, sourceName, rows } = value as { schemaVersion?: unknown; sourceName?: unknown; rows?: unknown };
  if (schemaVersion !== "1" || typeof sourceName !== "string" || !sourceName.trim() || sourceName.trim().length > 120 || !Array.isArray(rows)) throw new PurchaseError("INVALID");
  if (!rows.length || rows.length > 200) throw new PurchaseError("TOO_LARGE");
  const { seller } = await purchaseSellerAccess(userId, sellerSlug);
  const checksum = createHash("sha256").update(JSON.stringify({ schemaVersion, sourceName: sourceName.trim(), rows })).digest("hex");
  const existingBatch = await PurchaseImportBatch.findOne({ sellerId: seller._id, checksum }).lean();
  if (existingBatch) return existingBatch;
  const seen = new Set<string>();
  const results = [];
  for (let index = 0; index < rows.length; index += 1) {
    let data: PurchaseInput | null = null;
    const errorCodes: string[] = [];
    try { data = validatePurchaseInput(rows[index]); } catch (error) { errorCodes.push(error instanceof Error ? error.message : "record"); }
    const key = data ? `${data.orderId}\u0000${data.lineId}` : "";
    if (key && seen.has(key)) errorCodes.push("duplicateLine");
    if (key) seen.add(key);
    const existing = data ? await Purchase.findOne({ sellerId: seller._id, orderId: data.orderId, lineId: data.lineId }).lean() : null;
    const checksumForRow = data ? rowChecksum(data) : "";
    if (existing && existing.sourceChecksum !== checksumForRow) errorCodes.push("conflictingExistingLine");
    results.push({ row: index + 1, key: data ? `${data.orderId}/${data.lineId}` : "", action: errorCodes.length ? "error" : existing ? "unchanged" : "create", data, errorCodes });
  }
  try {
    return await PurchaseImportBatch.create({ sellerId: seller._id, createdByUserId: userId, schemaVersion, sourceName: sourceName.trim(), checksum, rows: results });
  } catch (error: any) {
    if (error?.code === 11000) return PurchaseImportBatch.findOne({ sellerId: seller._id, checksum }).lean();
    throw error;
  }
}

export async function purchaseImportBatch(userId: string, sellerSlug: string, batchId: string) {
  if (!mongoose.isValidObjectId(batchId)) throw new PurchaseError("INVALID");
  const { seller } = await purchaseSellerAccess(userId, sellerSlug);
  const batch = await PurchaseImportBatch.findOne({ _id: batchId, sellerId: seller._id }).lean();
  if (!batch) throw new PurchaseError("NOT_FOUND");
  return batch;
}

export async function applyPurchaseImport(userId: string, sellerSlug: string, batchId: string) {
  if (!mongoose.isValidObjectId(batchId)) throw new PurchaseError("INVALID");
  const { seller } = await purchaseSellerAccess(userId, sellerSlug);
  const db = await connectDatabase();
  let result: any;
  await db.connection.transaction(async (session) => {
    const batch = await PurchaseImportBatch.findOne({ _id: batchId, sellerId: seller._id }).session(session);
    if (!batch) throw new PurchaseError("NOT_FOUND");
    if (batch.status === "applied") { result = batch; return; }
    if (batch.rows.some((row: any) => row.action === "error")) throw new PurchaseError("INVALID");
    for (const row of batch.rows as any[]) {
      if (row.action === "unchanged") continue;
      const data = validated(row.data);
      const customer = await Customer.findOneAndUpdate(
        { sellerId: seller._id, externalBuyerId: data.externalBuyerId },
        { $set: { emailNormalized: data.buyerEmail, displayName: data.buyerName, sourceName: batch.sourceName }, $setOnInsert: { privacyStatus: "active" } },
        { upsert: true, new: true, session, runValidators: true },
      );
      const product = await Product.findOne({ sellerId: seller._id, skuNormalized: data.productSku.toUpperCase() }).session(session).lean();
      await Purchase.create([{
        sellerId: seller._id, customerId: customer._id, orderId: data.orderId, lineId: data.lineId,
        productId: product?._id ?? null, productSku: data.productSku, productNameSnapshot: data.productName,
        purchasedAt: data.purchasedAt, quantity: data.quantity, totalHuf: data.totalHuf,
        sourceName: batch.sourceName, sourceChecksum: rowChecksum(data), importBatchId: batch._id,
      }], { session });
    }
    batch.status = "applied";
    batch.appliedAt = new Date();
    await batch.save({ session });
    result = batch;
  });
  return result;
}

export async function listCustomers(userId: string, sellerSlug: string) {
  const { seller } = await purchaseSellerAccess(userId, sellerSlug);
  const rows = await Customer.aggregate([
    { $match: { sellerId: seller._id } },
    { $lookup: { from: "purchases", localField: "_id", foreignField: "customerId", as: "purchases" } },
    { $project: { externalBuyerId: 1, displayName: 1, emailNormalized: 1, privacyStatus: 1, purchaseCount: { $size: "$purchases" }, totalHuf: { $sum: { $map: { input: "$purchases", as: "purchase", in: { $cond: [{ $eq: ["$$purchase.status", "purchased"] }, "$$purchase.totalHuf", 0] } } } }, lastPurchaseAt: { $max: "$purchases.purchasedAt" } } },
    { $sort: { lastPurchaseAt: -1, _id: 1 } },
    { $limit: 100 },
  ]);
  return { seller, customers: rows.map((row) => ({ ...row, id: row._id.toString(), _id: undefined })) };
}

export async function customerHistory(userId: string, sellerSlug: string, customerId: string, limit = 50) {
  if (!mongoose.isValidObjectId(customerId)) throw new PurchaseError("INVALID");
  const { seller } = await purchaseSellerAccess(userId, sellerSlug);
  const customer = await Customer.findOne({ _id: customerId, sellerId: seller._id }).lean();
  if (!customer) throw new PurchaseError("NOT_FOUND");
  const purchases = await Purchase.find({ sellerId: seller._id, customerId: customer._id }).sort({ purchasedAt: -1, _id: -1 }).limit(Math.min(Math.max(limit, 1), 100)).lean();
  return { customer, purchases: purchases.map(purchaseOutput) };
}

export async function updatePurchaseStatus(userId: string, sellerSlug: string, purchaseId: string, expectedVersion: unknown, status: unknown, reason: unknown) {
  if (!mongoose.isValidObjectId(purchaseId) || !Number.isInteger(expectedVersion) || !["refunded", "corrected"].includes(String(status)) || typeof reason !== "string" || !reason.trim() || reason.trim().length > 300) throw new PurchaseError("INVALID");
  const { seller } = await purchaseSellerAccess(userId, sellerSlug);
  const purchase = await Purchase.findOneAndUpdate(
    { _id: purchaseId, sellerId: seller._id, version: expectedVersion, status: "purchased" },
    { $set: { status, correctionReason: reason.trim(), correctedAt: new Date(), correctedByUserId: userId }, $inc: { version: 1 } },
    { new: true, runValidators: true },
  );
  if (!purchase) throw new PurchaseError((await Purchase.exists({ _id: purchaseId, sellerId: seller._id })) ? "STALE" : "NOT_FOUND");
  return purchaseOutput(purchase.toObject());
}

export async function updateCustomerPrivacy(userId: string, sellerSlug: string, customerId: string, status: unknown) {
  if (!mongoose.isValidObjectId(customerId) || !["active", "restricted", "erasure_requested"].includes(String(status))) throw new PurchaseError("INVALID");
  const { seller } = await purchaseSellerAccess(userId, sellerSlug);
  const database = await connectDatabase();
  let result: { id: string; privacyStatus: string } | undefined;
  await database.connection.transaction(async (session) => {
    const customer = await Customer.findOneAndUpdate(
      { _id: customerId, sellerId: seller._id },
      { $set: { privacyStatus: status } },
      { returnDocument: "after", runValidators: true, session },
    ).lean();
    if (!customer) throw new PurchaseError("NOT_FOUND");
    if (status !== "active" && customer.emailNormalized) {
      const buyer = await User.findOne({ emailNormalized: customer.emailNormalized }).session(session).lean();
      if (buyer) {
        const now = new Date();
        const subscribed = await ChannelPreference.find({ sellerId: seller._id, buyerUserId: buyer._id, purpose: "marketing", status: "subscribed" }).session(session).lean();
        if (subscribed.length) {
          await ChannelPreference.updateMany({ sellerId: seller._id, buyerUserId: buyer._id, purpose: "marketing", status: "subscribed" }, { $set: { status: "unsubscribed", noticeVersion: PRIVACY_NOTICE_VERSION, changedAt: now } }, { session });
          await ConsentEvent.create(subscribed.map((row) => ({ sellerId: seller._id, buyerUserId: buyer._id, customerId: customer._id, channel: row.channel, purpose: "marketing", action: "withdrawn", noticeVersion: PRIVACY_NOTICE_VERSION, occurredAt: now, actorUserId: userId })), { session });
        }
      }
    }
    result = { id: customer._id.toString(), privacyStatus: customer.privacyStatus };
  });
  return result!;
}

export async function buyerHistory(userId: string, sellerSlug: string) {
  await connectDatabase();
  const seller = await Seller.findOne({ slug: sellerSlug, status: "active" }).lean();
  if (!seller) throw new PurchaseError("NOT_FOUND");
  const relationship = await BuyerRelationship.findOne({ sellerId: seller._id, buyerUserId: userId, status: "active" }).lean();
  if (!relationship) throw new PurchaseError("FORBIDDEN");
  const user = await User.findById(userId).lean();
  const customer = user ? await Customer.findOne({ sellerId: seller._id, emailNormalized: user.emailNormalized }).lean() : null;
  const purchases = customer ? await Purchase.find({ sellerId: seller._id, customerId: customer._id }).sort({ purchasedAt: -1, _id: -1 }).limit(100).lean() : [];
  return { seller, customer, purchases: purchases.map(purchaseOutput) };
}
