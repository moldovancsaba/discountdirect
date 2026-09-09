import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose documents are normalized at this boundary. */
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { BuyerRelationship, Membership, Seller, User } from "@/auth/models";
import { Product } from "@/catalog/models";
import { connectDatabase } from "@/lib/database";
import { Customer, Purchase } from "@/purchases/models";
import { ChannelPreference } from "@/privacy/models";
import { rankRecommendations, RECOMMENDATION_RULE_VERSION } from "./engine";
import { RecommendationPreview } from "./models";

export class RecommendationError extends Error { constructor(public code: "FORBIDDEN" | "NOT_FOUND" | "INVALID") { super(code); } }
function output(row: any) { return { id: row._id.toString(), channel: row.channel, ruleVersion: row.ruleVersion, status: row.status, exclusionReasons: row.exclusionReasons ?? [], recommendations: (row.recommendations ?? []).map((item: any) => ({ productId: item.productId.toString(), productVersion: item.productVersion, productSku: item.productSku, productName: item.productName, priceHuf: item.priceHuf, score: item.score, reasonCode: item.reasonCode, reasonText: item.reasonText, evidencePurchaseIds: item.evidencePurchaseIds.map((id: any) => id.toString()) })), createdAt: row.createdAt }; }

export async function createRecommendationPreview(userId: string, sellerSlug: string, customerId: string, channelValue: unknown) {
  if (!mongoose.isValidObjectId(customerId) || !["email", "postal"].includes(String(channelValue))) throw new RecommendationError("INVALID");
  const channel = String(channelValue) as "email" | "postal";
  await connectDatabase();
  const seller = await Seller.findOne({ slug: sellerSlug, status: "active" }).lean();
  if (!seller) throw new RecommendationError("NOT_FOUND");
  if (!await Membership.exists({ sellerId: seller._id, userId, status: "active" })) throw new RecommendationError("FORBIDDEN");
  const customer = await Customer.findOne({ _id: customerId, sellerId: seller._id }).lean();
  if (!customer) throw new RecommendationError("NOT_FOUND");
  const buyer = customer.emailNormalized ? await User.findOne({ emailNormalized: customer.emailNormalized, status: "active" }).lean() : null;
  const relationship = buyer ? await BuyerRelationship.findOne({ sellerId: seller._id, buyerUserId: buyer._id, status: "active" }).lean() : null;
  const preference = buyer ? await ChannelPreference.findOne({ sellerId: seller._id, buyerUserId: buyer._id, channel, purpose: "marketing", status: "subscribed" }).lean() : null;
  const [products, purchases] = await Promise.all([Product.find({ sellerId: seller._id }).lean(), Purchase.find({ sellerId: seller._id, customerId: customer._id }).lean()]);
  const exclusionReasons = [];
  if (customer.privacyStatus !== "active") exclusionReasons.push("PRIVACY_RESTRICTED");
  if (!buyer || !relationship) exclusionReasons.push("NO_ACTIVE_BUYER_RELATIONSHIP");
  if (!preference) exclusionReasons.push("NO_CHANNEL_CONSENT");
  const recommendations = exclusionReasons.length ? [] : rankRecommendations(products.map((item: any) => ({ id: item._id.toString(), version: item.version, sku: item.sku, name: item.name, priceHuf: item.priceHuf, stock: item.stock, active: item.active, category: item.category, compatibleWith: item.compatibleWith ?? [] })), purchases.map((item: any) => ({ id: item._id.toString(), productSku: item.productSku, purchasedAt: item.purchasedAt, status: item.status })));
  const status = exclusionReasons.length ? "blocked" : recommendations.length ? "eligible" : "empty";
  const inputHash = createHash("sha256").update(JSON.stringify({ customer: [customer._id.toString(), customer.privacyStatus], buyer: buyer?._id.toString() ?? null, relationship: relationship?.status ?? null, preference: preference?.changedAt ?? null, channel, products: products.map((item: any) => [item._id.toString(), item.version, item.stock, item.active]).sort(), purchases: purchases.map((item: any) => [item._id.toString(), item.status, item.purchasedAt]).sort(), ruleVersion: RECOMMENDATION_RULE_VERSION })).digest("hex");
  const payload = recommendations.map(({ product, evidenceIds, ...item }) => ({ ...item, productId: product.id, productVersion: product.version, productSku: product.sku, productName: product.name, priceHuf: product.priceHuf, evidencePurchaseIds: evidenceIds }));
  try {
    const row = await RecommendationPreview.create({ sellerId: seller._id, customerId: customer._id, buyerUserId: buyer?._id ?? null, channel, ruleVersion: RECOMMENDATION_RULE_VERSION, inputHash, status, exclusionReasons, recommendations: payload, createdByUserId: userId });
    return output(row.toObject());
  } catch (error: any) {
    if (error?.code === 11000) { const row = await RecommendationPreview.findOne({ sellerId: seller._id, customerId: customer._id, channel, ruleVersion: RECOMMENDATION_RULE_VERSION, inputHash }).lean(); if (row) return output(row); }
    throw error;
  }
}

export async function recommendationPreview(userId: string, sellerSlug: string, previewId: string) {
  if (!mongoose.isValidObjectId(previewId)) throw new RecommendationError("INVALID");
  await connectDatabase();
  const seller = await Seller.findOne({ slug: sellerSlug, status: "active" }).lean();
  if (!seller) throw new RecommendationError("NOT_FOUND");
  if (!await Membership.exists({ sellerId: seller._id, userId, status: "active" })) throw new RecommendationError("FORBIDDEN");
  const row = await RecommendationPreview.findOne({ _id: previewId, sellerId: seller._id }).lean();
  if (!row) throw new RecommendationError("NOT_FOUND");
  return output(row);
}
