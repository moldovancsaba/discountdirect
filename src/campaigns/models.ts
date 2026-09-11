import mongoose from "mongoose";

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
  discountPct: { type: Number, required: true, min: 0, max: 100 },
  priceHuf: { type: Number, required: true, min: 0 },
  channel: { type: String, enum: ["email", "postal"], required: true },
  quantity: { type: Number, required: true, min: 1, max: 1000 },
  remaining: { type: Number, required: true, min: 0 },
  expiresAt: { type: Date, required: true, index: true },
  status: { type: String, enum: ["active", "expired", "cancelled", "completed"], default: "active", index: true },
  audienceSnapshot: { type: [audienceSchema], required: true },
  clientRequestId: { type: String, required: true, maxlength: 120 },
  createdByUserId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  cancelledAt: { type: Date, default: null },
}, { ...timestamps, collection: "campaigns" });
campaignSchema.index({ sellerId: 1, createdByUserId: 1, clientRequestId: 1 }, { unique: true });
campaignSchema.index({ sellerId: 1, status: 1, expiresAt: 1, _id: -1 });

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

export const Campaign = models.Campaign || model("Campaign", campaignSchema);
export const CampaignReservation = models.CampaignReservation || model("CampaignReservation", reservationSchema);
export const CampaignInventoryBalance = models.CampaignInventoryBalance || model("CampaignInventoryBalance", inventoryBalanceSchema);
export const campaignModels = [Campaign, CampaignReservation, CampaignInventoryBalance];
