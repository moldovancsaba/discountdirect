import mongoose from "mongoose";
import { sellerScopedSchema } from "../lib/tenant-core.ts";
const { Schema, model, models } = mongoose;
const customerMembershipSchema = new Schema({
  sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
  buyerUserId: { type: Schema.Types.ObjectId, required: true, ref: "User", index: true },
  status: { type: String, enum: ["active", "left"], required: true, default: "active", index: true },
  tier: { type: String, enum: ["member", "silver", "gold"], required: true, default: "member" },
  joinedAt: { type: Date, required: true },
  leftAt: { type: Date, default: null },
  version: { type: Number, required: true, default: 1, min: 1 },
  ruleVersion: { type: String, required: true, maxlength: 80 },
}, { timestamps: true, versionKey: false, collection: "customer_memberships" });
customerMembershipSchema.index({ sellerId: 1, buyerUserId: 1 }, { unique: true });
customerMembershipSchema.plugin(sellerScopedSchema);
export const CustomerMembership = models.CustomerMembership || model("CustomerMembership", customerMembershipSchema);
