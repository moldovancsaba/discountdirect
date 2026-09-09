import mongoose from "mongoose";

const { Schema, model, models } = mongoose;
const timestamps = { timestamps: true, versionKey: false } as const;

const customerSchema = new Schema(
  {
    sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
    externalBuyerId: { type: String, required: true, maxlength: 100 },
    emailNormalized: { type: String, default: null, maxlength: 254 },
    displayName: { type: String, required: true, maxlength: 120 },
    privacyStatus: { type: String, enum: ["active", "restricted", "erasure_requested", "erased"], default: "active", index: true },
    sourceName: { type: String, required: true, maxlength: 120 },
  },
  { ...timestamps, collection: "customers" },
);
customerSchema.index({ sellerId: 1, externalBuyerId: 1 }, { unique: true });
customerSchema.index({ sellerId: 1, emailNormalized: 1 }, { partialFilterExpression: { emailNormalized: { $type: "string" } } });

const purchaseSchema = new Schema(
  {
    sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
    customerId: { type: Schema.Types.ObjectId, required: true, ref: "Customer", index: true },
    orderId: { type: String, required: true, maxlength: 100 },
    lineId: { type: String, required: true, maxlength: 100 },
    productId: { type: Schema.Types.ObjectId, default: null, ref: "Product" },
    productSku: { type: String, required: true, maxlength: 64 },
    productNameSnapshot: { type: String, required: true, maxlength: 160 },
    purchasedAt: { type: Date, required: true },
    quantity: { type: Number, required: true, min: 1, max: 100_000 },
    totalHuf: { type: Number, required: true, min: 0, max: 1_000_000_000 },
    status: { type: String, enum: ["purchased", "refunded", "corrected"], default: "purchased", index: true },
    sourceName: { type: String, required: true, maxlength: 120 },
    sourceChecksum: { type: String, required: true },
    importBatchId: { type: Schema.Types.ObjectId, required: true, ref: "PurchaseImportBatch" },
    correctionReason: { type: String, default: null, maxlength: 300 },
    correctedAt: { type: Date, default: null },
    correctedByUserId: { type: Schema.Types.ObjectId, default: null, ref: "User" },
    version: { type: Number, required: true, default: 1 },
  },
  { ...timestamps, collection: "purchases" },
);
purchaseSchema.index({ sellerId: 1, orderId: 1, lineId: 1 }, { unique: true });
purchaseSchema.index({ sellerId: 1, customerId: 1, purchasedAt: -1, _id: -1 });

const importRowSchema = new Schema(
  {
    row: { type: Number, required: true },
    key: { type: String, default: "" },
    action: { type: String, enum: ["create", "unchanged", "error"], required: true },
    data: { type: Schema.Types.Mixed, default: null },
    errorCodes: [{ type: String }],
  },
  { _id: false, versionKey: false },
);

const purchaseImportBatchSchema = new Schema(
  {
    sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
    createdByUserId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
    schemaVersion: { type: String, enum: ["1"], required: true },
    sourceName: { type: String, required: true, maxlength: 120 },
    checksum: { type: String, required: true },
    status: { type: String, enum: ["preview", "applied"], default: "preview", index: true },
    rows: { type: [importRowSchema], required: true },
    appliedAt: { type: Date, default: null },
  },
  { ...timestamps, collection: "purchase_import_batches" },
);
purchaseImportBatchSchema.index({ sellerId: 1, checksum: 1 }, { unique: true });

export const Customer = models.Customer || model("Customer", customerSchema);
export const Purchase = models.Purchase || model("Purchase", purchaseSchema);
export const PurchaseImportBatch = models.PurchaseImportBatch || model("PurchaseImportBatch", purchaseImportBatchSchema);
export const purchaseModels = [Customer, Purchase, PurchaseImportBatch];
