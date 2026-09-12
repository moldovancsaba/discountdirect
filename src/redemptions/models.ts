import mongoose from "mongoose";

const { Schema, model, models } = mongoose;
const timestamps = { timestamps: true, versionKey: false } as const;

const redemptionCouponSchema = new Schema(
  {
    sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
    buyerUserId: { type: Schema.Types.ObjectId, required: true, ref: "User", index: true },
    customerId: { type: Schema.Types.ObjectId, required: true, ref: "Customer" },
    offerId: { type: Schema.Types.ObjectId, required: true, ref: "Offer", unique: true, index: true },
    campaignId: { type: Schema.Types.ObjectId, default: null, ref: "Campaign", index: true },
    code: { type: String, required: true, unique: true, maxlength: 32 },
    status: { type: String, enum: ["issued", "redeemed", "expired", "cancelled"], required: true, default: "issued", index: true },
    issuedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, index: true },
    redeemedAt: { type: Date, default: null },
    redeemedByUserId: { type: Schema.Types.ObjectId, default: null, ref: "User" },
    version: { type: Number, required: true, default: 1, min: 1 },
  },
  { ...timestamps, collection: "redemption_coupons" },
);
redemptionCouponSchema.index({ sellerId: 1, status: 1, expiresAt: 1, _id: -1 });
redemptionCouponSchema.index({ buyerUserId: 1, status: 1, expiresAt: 1, _id: -1 });

const redemptionEventSchema = new Schema(
  {
    couponId: { type: Schema.Types.ObjectId, required: true, ref: "RedemptionCoupon", index: true },
    sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
    status: { type: String, enum: ["issued", "redeemed", "expired", "cancelled"], required: true },
    occurredAt: { type: Date, required: true },
    actorUserId: { type: Schema.Types.ObjectId, default: null, ref: "User" },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: "redemption_events" },
);
redemptionEventSchema.index({ couponId: 1, occurredAt: 1, _id: 1 });

export const RedemptionCoupon = models.RedemptionCoupon || model("RedemptionCoupon", redemptionCouponSchema);
export const RedemptionEvent = models.RedemptionEvent || model("RedemptionEvent", redemptionEventSchema);
export const redemptionModels = [RedemptionCoupon, RedemptionEvent];
