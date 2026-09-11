import mongoose from "mongoose";

const { Schema, model, models } = mongoose;
const timestamps = { timestamps: true, versionKey: false } as const;

const offerSchema = new Schema({
  sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
  buyerUserId: { type: Schema.Types.ObjectId, required: true, ref: "User", index: true },
  customerId: { type: Schema.Types.ObjectId, required: true, ref: "Customer", index: true },
  conversationId: { type: Schema.Types.ObjectId, default: null, ref: "Conversation" },
  campaignId: { type: Schema.Types.ObjectId, default: null, ref: "Campaign", index: true },
  recommendationPreviewId: { type: Schema.Types.ObjectId, required: true, ref: "RecommendationPreview" },
  channel: { type: String, enum: ["email", "postal"], required: true },
  productId: { type: Schema.Types.ObjectId, required: true, ref: "Product" },
  productSku: { type: String, required: true, maxlength: 64 },
  productName: { type: String, required: true, maxlength: 160 },
  productVersion: { type: Number, required: true },
  reasonCode: { type: String, required: true, maxlength: 80 },
  reasonText: { type: String, required: true, maxlength: 300 },
  evidencePurchaseIds: [{ type: Schema.Types.ObjectId, required: true, ref: "Purchase" }],
  originalHuf: { type: Number, required: true, min: 1 },
  discountPct: { type: Number, required: true, min: 0, max: 100 },
  priceHuf: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ["pending", "accepted", "declined", "expired", "cancelled"], default: "pending", index: true },
  expiresAt: { type: Date, required: true, index: true },
  decidedAt: { type: Date, default: null },
  decisionByUserId: { type: Schema.Types.ObjectId, default: null, ref: "User" },
  version: { type: Number, required: true, default: 1, min: 1 },
  clientRequestId: { type: String, required: true, maxlength: 120 },
  createdByUserId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
}, { ...timestamps, collection: "offers" });
offerSchema.index({ sellerId: 1, createdByUserId: 1, clientRequestId: 1 }, { unique: true });
offerSchema.index({ buyerUserId: 1, status: 1, expiresAt: 1, _id: 1 });
offerSchema.index({ sellerId: 1, customerId: 1, createdAt: -1, _id: -1 });
offerSchema.index({ campaignId: 1, buyerUserId: 1 }, { unique: true, partialFilterExpression: { campaignId: { $type: "objectId" } } });

const offerEventSchema = new Schema({
  offerId: { type: Schema.Types.ObjectId, required: true, ref: "Offer", index: true }, sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
  type: { type: String, enum: ["created", "accepted", "declined", "expired", "cancelled"], required: true }, version: { type: Number, required: true }, occurredAt: { type: Date, required: true }, actorUserId: { type: Schema.Types.ObjectId, default: null, ref: "User" },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: "offer_events" });
offerEventSchema.index({ offerId: 1, occurredAt: 1, _id: 1 });

export const Offer = models.Offer || model("Offer", offerSchema);
export const OfferEvent = models.OfferEvent || model("OfferEvent", offerEventSchema);
export const offerModels = [Offer, OfferEvent];
