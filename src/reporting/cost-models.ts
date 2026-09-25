import mongoose from "mongoose";
import { sellerScopedSchema } from "@/lib/tenant-core";

const { Schema, model, models } = mongoose;
const schema = new Schema({
  sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
  productId: { type: Schema.Types.ObjectId, required: true, ref: "Product", index: true },
  version: { type: Number, required: true, min: 1 },
  unitCostHuf: { type: Number, required: true, min: 0, max: 1_000_000_000 },
  effectiveAt: { type: Date, required: true, index: true },
  createdByUserId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  reason: { type: String, required: true, maxlength: 240 },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: "product_cost_revisions" });
schema.index({ sellerId: 1, productId: 1, version: 1 }, { unique: true });
schema.index({ sellerId: 1, productId: 1, effectiveAt: -1, version: -1 });
schema.plugin(sellerScopedSchema);
export const ProductCostRevision = models.ProductCostRevision || model("ProductCostRevision", schema);
