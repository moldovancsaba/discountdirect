import mongoose from "mongoose";
import { sellerScopedSchema } from "@/lib/tenant-core";

const { Schema, model, models } = mongoose;

const productWatchSchema = new Schema(
  {
    sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
    buyerUserId: { type: Schema.Types.ObjectId, required: true, ref: "User", index: true },
    customerId: { type: Schema.Types.ObjectId, required: true, ref: "Customer", index: true },
    productId: { type: Schema.Types.ObjectId, required: true, ref: "Product", index: true },
    triggerKind: { type: String, enum: ["back_in_stock", "price_drop"], required: true },
    status: { type: String, enum: ["active", "paused", "cancelled"], required: true, default: "active", index: true },
    lastTriggeredEvidenceHash: { type: String, default: null, maxlength: 64 },
    lastTriggeredAt: { type: Date, default: null },
    version: { type: Number, required: true, default: 1, min: 1 },
  },
  { timestamps: true, versionKey: false, collection: "product_watches" },
);
productWatchSchema.index(
  { sellerId: 1, buyerUserId: 1, productId: 1, triggerKind: 1 },
  { unique: true },
);
productWatchSchema.plugin(sellerScopedSchema);

export const ProductWatch = models.ProductWatch || model("ProductWatch", productWatchSchema);
