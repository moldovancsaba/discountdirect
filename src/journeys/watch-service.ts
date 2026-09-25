import "server-only";
import mongoose from "mongoose";
import { BuyerRelationship, Seller, User } from "@/auth/models";
import { Customer } from "@/purchases/models";
import { Product } from "@/catalog/models";
import { connectDatabase } from "@/lib/database";
import { ProductWatch } from "./watch-models";

export class ProductWatchError extends Error {
  constructor(public code: "NOT_FOUND" | "FORBIDDEN" | "INVALID" | "CONFLICT") { super(code); }
}

function parsed(value: unknown) {
  if (!value || typeof value !== "object") throw new ProductWatchError("INVALID");
  const body = value as Record<string, unknown>;
  if (!mongoose.isValidObjectId(body.productId) || !["back_in_stock", "price_drop"].includes(String(body.triggerKind)))
    throw new ProductWatchError("INVALID");
  return { productId: String(body.productId), triggerKind: String(body.triggerKind) as "back_in_stock" | "price_drop" };
}

async function buyerContext(userId: string, sellerSlug: string, productId: string) {
  await connectDatabase();
  const seller = await Seller.findOne({ slug: sellerSlug, status: "active" }).lean();
  if (!seller) throw new ProductWatchError("NOT_FOUND");
  const relationship = await BuyerRelationship.findOne({ sellerId: seller._id, buyerUserId: userId, status: "active" }).lean();
  if (!relationship) throw new ProductWatchError("FORBIDDEN");
  const product = await Product.findOne({ _id: productId, sellerId: seller._id, active: true }).lean();
  if (!product) throw new ProductWatchError("NOT_FOUND");
  const user = await User.findById(userId).lean();
  const customer = user
    ? await Customer.findOne({ emailNormalized: user.emailNormalized, sellerId: seller._id, privacyStatus: "active" }).lean()
    : null;
  if (!customer) throw new ProductWatchError("FORBIDDEN");
  return { seller, relationship, customer, product };
}

export async function listProductWatches(userId: string, sellerSlug: string) {
  await connectDatabase();
  const seller = await Seller.findOne({ slug: sellerSlug, status: "active" }).lean();
  if (!seller) throw new ProductWatchError("NOT_FOUND");
  if (!await BuyerRelationship.exists({ sellerId: seller._id, buyerUserId: userId, status: "active" })) throw new ProductWatchError("FORBIDDEN");
  const rows = await ProductWatch.find({ sellerId: seller._id, buyerUserId: userId }).sort({ updatedAt: -1, _id: -1 }).lean();
  return { watches: rows.map((row) => ({ id: row._id.toString(), productId: row.productId.toString(), triggerKind: row.triggerKind, status: row.status, version: row.version, lastTriggeredAt: row.lastTriggeredAt })) };
}

export async function upsertProductWatch(userId: string, sellerSlug: string, raw: unknown) {
  const value = parsed(raw);
  const { seller, customer, product } = await buyerContext(userId, sellerSlug, value.productId);
  const row = await ProductWatch.findOneAndUpdate(
    { sellerId: seller._id, buyerUserId: userId, productId: product._id, triggerKind: value.triggerKind },
    { $set: { customerId: customer._id, status: "active" }, $setOnInsert: { version: 0 }, $inc: { version: 1 } },
    { upsert: true, new: true, runValidators: true },
  ).lean();
  return { watch: { id: row!._id.toString(), productId: row!.productId.toString(), triggerKind: row!.triggerKind, status: row!.status, version: row!.version } };
}

export async function cancelProductWatch(userId: string, sellerSlug: string, watchId: string, expectedVersion: number) {
  if (!mongoose.isValidObjectId(watchId) || !Number.isInteger(expectedVersion)) throw new ProductWatchError("INVALID");
  await connectDatabase();
  const seller = await Seller.findOne({ slug: sellerSlug, status: "active" }).lean();
  if (!seller) throw new ProductWatchError("NOT_FOUND");
  const row = await ProductWatch.findOneAndUpdate(
    { _id: watchId, sellerId: seller._id, buyerUserId: userId, version: expectedVersion, status: { $in: ["active", "paused"] } },
    { $set: { status: "cancelled" }, $inc: { version: 1 } },
    { new: true, runValidators: true },
  ).lean();
  if (!row) throw new ProductWatchError("CONFLICT");
  return { watch: { id: row._id.toString(), productId: row.productId.toString(), triggerKind: row.triggerKind, status: row.status, version: row.version } };
}
