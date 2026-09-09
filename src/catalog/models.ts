import mongoose from "mongoose";

const { Schema, model, models } = mongoose;
const timestamps = { timestamps: true, versionKey: false } as const;

const productSchema = new Schema(
  {
    sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
    sku: { type: String, required: true, maxlength: 64 },
    skuNormalized: { type: String, required: true, maxlength: 64 },
    name: { type: String, required: true, maxlength: 160 },
    priceHuf: { type: Number, required: true, min: 0, max: 1_000_000_000 },
    stock: { type: Number, required: true, min: 0, max: 1_000_000 },
    category: { type: String, required: true, maxlength: 80 },
    compatibleWith: [{ type: String, maxlength: 80 }],
    active: { type: Boolean, default: true, index: true },
    version: { type: Number, required: true, default: 1, min: 1 },
    updatedByUserId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  },
  { ...timestamps, collection: "products" },
);
productSchema.index({ sellerId: 1, skuNormalized: 1 }, { unique: true });
productSchema.index({ sellerId: 1, active: 1, _id: 1 });

const productRevisionSchema = new Schema(
  {
    sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
    productId: { type: Schema.Types.ObjectId, required: true, ref: "Product", index: true },
    version: { type: Number, required: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
    reason: { type: String, enum: ["create", "edit", "archive", "import"], required: true },
    changedByUserId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
    importBatchId: { type: Schema.Types.ObjectId, default: null, ref: "ImportBatch" },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: "product_revisions" },
);
productRevisionSchema.index({ productId: 1, version: 1 }, { unique: true });

const importRowSchema = new Schema(
  {
    row: { type: Number, required: true },
    sku: { type: String, default: "" },
    action: { type: String, enum: ["create", "update", "unchanged", "error"], required: true },
    expectedVersion: { type: Number, default: 0 },
    data: { type: Schema.Types.Mixed, default: null },
    errorCodes: [{ type: String }],
  },
  { _id: false, versionKey: false },
);

const importBatchSchema = new Schema(
  {
    sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
    createdByUserId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
    schemaVersion: { type: String, enum: ["1"], required: true },
    checksum: { type: String, required: true },
    status: { type: String, enum: ["preview", "applied", "failed"], default: "preview", index: true },
    rows: { type: [importRowSchema], required: true },
    appliedAt: { type: Date, default: null },
    failureCode: { type: String, default: null },
  },
  { ...timestamps, collection: "import_batches" },
);
importBatchSchema.index({ sellerId: 1, checksum: 1 }, { unique: true });

export const Product = models.Product || model("Product", productSchema);
export const ProductRevision = models.ProductRevision || model("ProductRevision", productRevisionSchema);
export const ImportBatch = models.ImportBatch || model("ImportBatch", importBatchSchema);
export const catalogModels = [Product, ProductRevision, ImportBatch];
