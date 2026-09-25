import "server-only";
import mongoose from "mongoose";
import { Membership, Seller } from "@/auth/models";
import { Product } from "@/catalog/models";
import { connectDatabase } from "@/lib/database";
import { withSellerTenant } from "@/lib/tenant-core";
import { ProductCostRevision } from "./cost-models";

export class CostRevisionError extends Error { constructor(public code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT") { super(code); } }
async function owner(userId: string, sellerSlug: string) {
  await connectDatabase();
  const seller = await Seller.findOne({ slug: sellerSlug, status: "active" }).lean();
  if (!seller) throw new CostRevisionError("NOT_FOUND");
  const membership = await Membership.findOne({ sellerId: seller._id, userId, status: "active", role: "owner" }).lean();
  if (!membership) throw new CostRevisionError("FORBIDDEN");
  return seller;
}
function output(row: { _id: { toString(): string }; productId: { toString(): string }; version: number; unitCostHuf: number; effectiveAt: Date; reason: string; createdAt: Date }) { return { id: row._id.toString(), productId: row.productId.toString(), version: row.version, unitCostHuf: row.unitCostHuf, effectiveAt: row.effectiveAt, reason: row.reason, createdAt: row.createdAt }; }
export async function listCostRevisions(userId: string, sellerSlug: string, productId: string) {
  const seller = await owner(userId, sellerSlug);
  if (!mongoose.isValidObjectId(productId)) throw new CostRevisionError("INVALID");
  const product = await Product.findOne({ _id: productId, sellerId: seller._id }).lean();
  if (!product) throw new CostRevisionError("NOT_FOUND");
  const rows = await withSellerTenant(seller._id, () => ProductCostRevision.find({ sellerId: seller._id, productId }).sort({ version: -1 }).limit(100).lean());
  return { productId, revisions: rows.map(output) };
}
export async function createCostRevision(userId: string, sellerSlug: string, input: { productId: string; unitCostHuf: number; effectiveAt: string; reason: string }) {
  const seller = await owner(userId, sellerSlug);
  if (!mongoose.isValidObjectId(input.productId) || !Number.isInteger(input.unitCostHuf) || input.unitCostHuf < 0 || input.unitCostHuf > 1_000_000_000 || typeof input.reason !== "string" || !input.reason.trim() || input.reason.length > 240) throw new CostRevisionError("INVALID");
  const effectiveAt = new Date(input.effectiveAt);
  if (Number.isNaN(effectiveAt.getTime()) || effectiveAt.getTime() > Date.now() + 300_000) throw new CostRevisionError("INVALID");
  const product = await Product.findOne({ _id: input.productId, sellerId: seller._id }).lean();
  if (!product) throw new CostRevisionError("NOT_FOUND");
  const latest = await withSellerTenant(seller._id, () => ProductCostRevision.findOne({ sellerId: seller._id, productId: product._id }).sort({ version: -1 }).lean());
  const row = await withSellerTenant(seller._id, () => ProductCostRevision.create({ sellerId: seller._id, productId: product._id, version: (latest?.version ?? 0) + 1, unitCostHuf: input.unitCostHuf, effectiveAt, createdByUserId: userId, reason: input.reason.trim() }));
  return output(row.toObject());
}
