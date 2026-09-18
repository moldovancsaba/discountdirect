import mongoose from "mongoose";
import { sellerScopedSchema } from "../lib/tenant-core.ts";

const { Schema, model, models } = mongoose;
const timestamps = { timestamps: true, versionKey: false } as const;

const audienceSchema = new Schema({
  buyerUserId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  customerId: { type: Schema.Types.ObjectId, required: true, ref: "Customer" },
  recommendationPreviewId: { type: Schema.Types.ObjectId, required: true, ref: "RecommendationPreview" },
  reasonCode: { type: String, required: true, maxlength: 80 },
  reasonText: { type: String, required: true, maxlength: 300 },
  evidencePurchaseIds: [{ type: Schema.Types.ObjectId, required: true, ref: "Purchase" }],
}, { _id: false, versionKey: false });

const campaignSchema = new Schema({
  sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
  kind: { type: String, enum: ["flash"], required: true, default: "flash" },
  productId: { type: Schema.Types.ObjectId, required: true, ref: "Product", index: true },
  productSku: { type: String, required: true, maxlength: 64 },
  productName: { type: String, required: true, maxlength: 160 },
  productVersion: { type: Number, required: true },
  originalHuf: { type: Number, required: true, min: 1 },
  referencePriceHuf: { type: Number, min: 1 },
  discountBaseHuf: { type: Number, min: 1 },
  referencePriceWindowStart: { type: Date },
  referencePriceCalculatedAt: { type: Date },
  referencePriceEvidenceVersions: [{ type: Number, min: 1 }],
  discountPct: { type: Number, required: true, min: 0, max: 100 },
  priceHuf: { type: Number, required: true, min: 0 },
  channel: { type: String, enum: ["email", "postal"], required: true },
  quantity: { type: Number, required: true, min: 1, max: 1000 },
  remaining: { type: Number, required: true, min: 0 },
  expiresAt: { type: Date, required: true, index: true },
  status: { type: String, enum: ["active", "expired", "cancelled", "completed"], default: "active", index: true },
  audienceSnapshot: { type: [audienceSchema], required: true },
  holdoutSnapshot: { type: [audienceSchema], default: [] },
  holdoutPct: { type: Number, min: 0, max: 20, default: 0 },
  holdoutMode: { type: String, enum: ["pooled", "per_campaign"], default: "pooled" },
  clientRequestId: { type: String, required: true, maxlength: 120 },
  createdByUserId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  cancelledAt: { type: Date, default: null },
}, { ...timestamps, collection: "campaigns" });
campaignSchema.index({ sellerId: 1, createdByUserId: 1, clientRequestId: 1 }, { unique: true });
campaignSchema.index({ sellerId: 1, status: 1, expiresAt: 1, _id: -1 });

const campaignPreviewSchema = new Schema({
  sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
  kind: { type: String, enum: ["flash"], required: true, default: "flash" },
  productId: { type: Schema.Types.ObjectId, required: true, ref: "Product", index: true },
  productSku: { type: String, required: true, maxlength: 64 },
  productName: { type: String, required: true, maxlength: 160 },
  productVersion: { type: Number, required: true },
  originalHuf: { type: Number, required: true, min: 1 },
  referencePriceHuf: { type: Number, min: 1 },
  discountBaseHuf: { type: Number, min: 1 },
  referencePriceWindowStart: { type: Date },
  referencePriceCalculatedAt: { type: Date },
  referencePriceEvidenceVersions: [{ type: Number, min: 1 }],
  discountPct: { type: Number, required: true, min: 0, max: 100 },
  priceHuf: { type: Number, required: true, min: 0 },
  channel: { type: String, enum: ["email", "postal"], required: true },
  quantity: { type: Number, required: true, min: 1, max: 1000 },
  expiresAt: { type: Date, required: true, index: true },
  status: { type: String, enum: ["ready", "launched", "expired"], default: "ready", index: true },
  audienceSnapshot: { type: [audienceSchema], required: true },
  holdoutSnapshot: { type: [audienceSchema], default: [] },
  holdoutPct: { type: Number, min: 0, max: 20, default: 0 },
  holdoutMode: { type: String, enum: ["pooled", "per_campaign"], default: "pooled" },
  inputHash: { type: String, required: true, maxlength: 64 },
  createdByUserId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  launchedCampaignId: { type: Schema.Types.ObjectId, default: null, ref: "Campaign" },
  launchedAt: { type: Date, default: null },
}, { ...timestamps, collection: "campaign_previews" });
campaignPreviewSchema.index({ sellerId: 1, createdAt: -1, _id: -1 });

const reservationSchema = new Schema({
  campaignId: { type: Schema.Types.ObjectId, required: true, ref: "Campaign", index: true },
  offerId: { type: Schema.Types.ObjectId, required: true, ref: "Offer", unique: true },
  sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
  productId: { type: Schema.Types.ObjectId, required: true, ref: "Product", index: true },
  buyerUserId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  status: { type: String, enum: ["reserved", "released"], default: "reserved", index: true },
  releasedAt: { type: Date, default: null },
  releaseReason: { type: String, enum: ["cancelled", "expired"], default: null },
}, { ...timestamps, collection: "campaign_reservations" });
reservationSchema.index({ campaignId: 1, buyerUserId: 1 });
reservationSchema.index({ sellerId: 1, productId: 1, status: 1 });

const inventoryBalanceSchema = new Schema({
  sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller" },
  productId: { type: Schema.Types.ObjectId, required: true, ref: "Product" },
  reserved: { type: Number, required: true, min: 0, default: 0 },
}, { ...timestamps, collection: "campaign_inventory_balances" });
inventoryBalanceSchema.index({ sellerId: 1, productId: 1 }, { unique: true });

campaignSchema.plugin(sellerScopedSchema);
campaignPreviewSchema.plugin(sellerScopedSchema);
reservationSchema.plugin(sellerScopedSchema);
inventoryBalanceSchema.plugin(sellerScopedSchema);

export const Campaign = models.Campaign || model("Campaign", campaignSchema);
export const CampaignPreview = models.CampaignPreview || model("CampaignPreview", campaignPreviewSchema);
export const CampaignReservation = models.CampaignReservation || model("CampaignReservation", reservationSchema);
export const CampaignInventoryBalance = models.CampaignInventoryBalance || model("CampaignInventoryBalance", inventoryBalanceSchema);
export const campaignModels = [Campaign, CampaignPreview, CampaignReservation, CampaignInventoryBalance];
