import mongoose from "mongoose";

const { Schema, model, models } = mongoose;
const timestamps = { timestamps: true, versionKey: false } as const;

const offerAutomationSchema = new Schema(
  {
    sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
    customerId: { type: Schema.Types.ObjectId, required: true, ref: "Customer", index: true },
    buyerUserId: { type: Schema.Types.ObjectId, required: true, ref: "User", index: true },
    channel: { type: String, enum: ["email", "postal"], required: true },
    cadence: { type: String, enum: ["weekly", "fortnightly", "monthly"], required: true },
    status: { type: String, enum: ["active", "paused"], required: true, default: "active", index: true },
    nextRunAt: { type: Date, required: true, index: true },
    lastRunAt: { type: Date, default: null },
    productLimit: { type: Number, required: true, min: 1, max: 10, default: 5 },
    clientRequestId: { type: String, required: true, maxlength: 120 },
    createdByUserId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
    version: { type: Number, required: true, default: 1, min: 1 },
  },
  { ...timestamps, collection: "offer_automations" },
);
offerAutomationSchema.index({ sellerId: 1, createdByUserId: 1, clientRequestId: 1 }, { unique: true });
offerAutomationSchema.index({ sellerId: 1, status: 1, nextRunAt: 1, _id: 1 });

const offerAutomationRunSchema = new Schema(
  {
    automationId: { type: Schema.Types.ObjectId, required: true, ref: "OfferAutomation", index: true },
    sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
    customerId: { type: Schema.Types.ObjectId, required: true, ref: "Customer" },
    buyerUserId: { type: Schema.Types.ObjectId, required: true, ref: "User", index: true },
    scheduledFor: { type: Date, required: true },
    status: { type: String, enum: ["completed", "skipped", "failed"], required: true, index: true },
    reasonCode: { type: String, required: true, maxlength: 120 },
    offerListId: { type: Schema.Types.ObjectId, default: null, ref: "OfferList" },
    deliveryId: { type: Schema.Types.ObjectId, default: null, ref: "DeliveryOutbox" },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
  },
  { ...timestamps, collection: "offer_automation_runs" },
);
offerAutomationRunSchema.index({ automationId: 1, scheduledFor: 1 }, { unique: true });

const offerListSchema = new Schema(
  {
    sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
    buyerUserId: { type: Schema.Types.ObjectId, required: true, ref: "User", index: true },
    customerId: { type: Schema.Types.ObjectId, required: true, ref: "Customer" },
    automationId: { type: Schema.Types.ObjectId, default: null, ref: "OfferAutomation", index: true },
    automationRunId: { type: Schema.Types.ObjectId, default: null, ref: "OfferAutomationRun", index: true },
    recommendationPreviewId: { type: Schema.Types.ObjectId, required: true, ref: "RecommendationPreview" },
    channel: { type: String, enum: ["email", "postal"], required: true },
    title: { type: String, required: true, maxlength: 160 },
    status: { type: String, enum: ["active", "expired", "cancelled"], required: true, default: "active", index: true },
    products: [{
      productId: { type: Schema.Types.ObjectId, required: true, ref: "Product" },
      productVersion: { type: Number, required: true },
      productSku: { type: String, required: true, maxlength: 64 },
      productName: { type: String, required: true, maxlength: 160 },
      priceHuf: { type: Number, required: true, min: 0 },
      reasonCode: { type: String, required: true, maxlength: 80 },
      reasonText: { type: String, required: true, maxlength: 300 },
      evidencePurchaseIds: [{ type: Schema.Types.ObjectId, required: true, ref: "Purchase" }],
    }],
    availableUntil: { type: Date, required: true, index: true },
    createdByUserId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  },
  { ...timestamps, collection: "offer_lists" },
);
offerListSchema.index({ buyerUserId: 1, status: 1, availableUntil: 1, _id: -1 });
offerListSchema.index({ sellerId: 1, createdAt: -1, _id: -1 });

export const OfferAutomation = models.OfferAutomation || model("OfferAutomation", offerAutomationSchema);
export const OfferAutomationRun = models.OfferAutomationRun || model("OfferAutomationRun", offerAutomationRunSchema);
export const OfferList = models.OfferList || model("OfferList", offerListSchema);
export const automationModels = [OfferAutomation, OfferAutomationRun, OfferList];
