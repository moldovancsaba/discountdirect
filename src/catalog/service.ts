import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose dynamic model results are normalized at this boundary. */
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { connectDatabase } from "@/lib/database";
import { Membership, Seller } from "@/auth/models";
import { ImportBatch, Product, ProductRevision } from "./models";
import { productInputErrors, validateProductInput, type ProductInput } from "./validation";

export class CatalogError extends Error {
  constructor(public code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT" | "STALE" | "TOO_LARGE") { super(code); }
}

function validated(value: unknown) {
  try {
    return validateProductInput(value);
  } catch {
    throw new CatalogError("INVALID");
  }
}

export async function sellerAccess(userId: string, sellerSlug: string) {
  await connectDatabase();
  const seller = await Seller.findOne({ slug: sellerSlug, status: "active" }).lean();
  if (!seller) throw new CatalogError("NOT_FOUND");
  const membership = await Membership.findOne({ sellerId: seller._id, userId, status: "active" }).lean();
  if (!membership) throw new CatalogError("FORBIDDEN");
  return { seller, membership };
}

function output(product: Record<string, any>) {
  return { id: product._id.toString(), sku: product.sku, name: product.name, priceHuf: product.priceHuf, stock: product.stock, category: product.category, compatibleWith: product.compatibleWith ?? [], active: product.active, version: product.version, updatedAt: product.updatedAt };
}

export async function listProducts(userId: string, sellerSlug: string, includeArchived = true) {
  const { seller } = await sellerAccess(userId, sellerSlug);
  const filter = { sellerId: seller._id, ...(includeArchived ? {} : { active: true }) };
  const products = await Product.find(filter).sort({ active: -1, name: 1, _id: 1 }).limit(100).lean();
  return { seller, products: products.map((item) => output(item as any)) };
}

async function revision(product: any, reason: "create" | "edit" | "archive" | "import", userId: string, importBatchId?: unknown, session?: mongoose.ClientSession) {
  await ProductRevision.create([{ sellerId: product.sellerId, productId: product._id, version: product.version, snapshot: output(product.toObject ? product.toObject() : product), reason, changedByUserId: userId, importBatchId: importBatchId ?? null }], { session });
}

export async function createProduct(userId: string, sellerSlug: string, value: unknown) {
  const data = validated(value);
  const { seller } = await sellerAccess(userId, sellerSlug);
  try {
    const product = await Product.create({ ...data, sellerId: seller._id, updatedByUserId: userId });
    await revision(product, "create", userId);
    return output(product.toObject());
  } catch (error: any) {
    if (error?.code === 11000) throw new CatalogError("CONFLICT");
    throw error;
  }
}

export async function updateProduct(userId: string, sellerSlug: string, productId: string, value: unknown, expectedVersion: unknown) {
  if (!mongoose.isValidObjectId(productId) || !Number.isInteger(expectedVersion) || Number(expectedVersion) < 1) throw new CatalogError("INVALID");
  const data = validated(value);
  const { seller } = await sellerAccess(userId, sellerSlug);
  try {
    const product = await Product.findOneAndUpdate(
      { _id: productId, sellerId: seller._id, version: expectedVersion },
      { $set: { ...data, updatedByUserId: userId }, $inc: { version: 1 } },
      { new: true, runValidators: true },
    );
    if (!product) {
      const exists = await Product.exists({ _id: productId, sellerId: seller._id });
      throw new CatalogError(exists ? "STALE" : "NOT_FOUND");
    }
    await revision(product, data.active ? "edit" : "archive", userId);
    return output(product.toObject());
  } catch (error: any) {
    if (error?.code === 11000) throw new CatalogError("CONFLICT");
    throw error;
  }
}

export async function previewImport(userId: string, sellerSlug: string, value: unknown) {
  if (!value || typeof value !== "object") throw new CatalogError("INVALID");
  const { schemaVersion, rows } = value as { schemaVersion?: unknown; rows?: unknown };
  if (schemaVersion !== "1" || !Array.isArray(rows)) throw new CatalogError("INVALID");
  if (!rows.length || rows.length > 100) throw new CatalogError("TOO_LARGE");
  const { seller } = await sellerAccess(userId, sellerSlug);
  const checksum = createHash("sha256").update(JSON.stringify({ schemaVersion, rows })).digest("hex");
  const existing = await ImportBatch.findOne({ sellerId: seller._id, checksum }).lean();
  if (existing) return existing;
  const seen = new Set<string>();
  const results = [];
  for (let index = 0; index < rows.length; index += 1) {
    const errors = productInputErrors(rows[index]);
    let data: ProductInput | null = null;
    if (!errors.length) data = validateProductInput(rows[index]);
    if (data && seen.has(data.skuNormalized)) errors.push("duplicateSku");
    if (data) seen.add(data.skuNormalized);
    const current = data ? await Product.findOne({ sellerId: seller._id, skuNormalized: data.skuNormalized }).lean() : null;
    const unchanged = current && data && ["sku", "name", "priceHuf", "stock", "category", "active"].every((key) => (current as any)[key] === (data as any)[key]) && JSON.stringify(current.compatibleWith ?? []) === JSON.stringify(data.compatibleWith);
    results.push({ row: index + 1, sku: data?.sku ?? "", action: errors.length ? "error" : current ? unchanged ? "unchanged" : "update" : "create", expectedVersion: current?.version ?? 0, data, errorCodes: errors });
  }
  try {
    return await ImportBatch.create({ sellerId: seller._id, createdByUserId: userId, schemaVersion, checksum, status: "preview", rows: results });
  } catch (error: any) {
    if (error?.code === 11000) return ImportBatch.findOne({ sellerId: seller._id, checksum }).lean();
    throw error;
  }
}

export async function getImportBatch(userId: string, sellerSlug: string, batchId: string) {
  if (!mongoose.isValidObjectId(batchId)) throw new CatalogError("INVALID");
  const { seller } = await sellerAccess(userId, sellerSlug);
  const batch = await ImportBatch.findOne({ _id: batchId, sellerId: seller._id }).lean();
  if (!batch) throw new CatalogError("NOT_FOUND");
  return batch;
}

export async function applyImport(userId: string, sellerSlug: string, batchId: string) {
  const { seller } = await sellerAccess(userId, sellerSlug);
  if (!mongoose.isValidObjectId(batchId)) throw new CatalogError("INVALID");
  const database = await connectDatabase();
  let result: any;
  await database.connection.transaction(async (session) => {
    const batch = await ImportBatch.findOne({ _id: batchId, sellerId: seller._id }).session(session);
    if (!batch) throw new CatalogError("NOT_FOUND");
    if (batch.status === "applied") { result = batch; return; }
    if (batch.rows.some((row: any) => row.action === "error")) throw new CatalogError("INVALID");
    for (const row of batch.rows as any[]) {
      if (row.action === "unchanged") continue;
      const data = validated(row.data);
      if (row.action === "create") {
        const product = new Product({ ...data, sellerId: seller._id, updatedByUserId: userId });
        await product.save({ session });
        await revision(product, "import", userId, batch._id, session);
      } else {
        const product = await Product.findOneAndUpdate(
          { sellerId: seller._id, skuNormalized: data.skuNormalized, version: row.expectedVersion },
          { $set: { ...data, updatedByUserId: userId }, $inc: { version: 1 } },
          { new: true, session, runValidators: true },
        );
        if (!product) throw new CatalogError("STALE");
        await revision(product, "import", userId, batch._id, session);
      }
    }
    batch.status = "applied";
    batch.appliedAt = new Date();
    await batch.save({ session });
    result = batch;
  });
  return result;
}

export const catalogModelsForIndexes = [Product, ProductRevision, ImportBatch];
