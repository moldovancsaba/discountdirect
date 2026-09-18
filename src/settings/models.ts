import mongoose from "mongoose";
import { sellerScopedSchema } from "@/lib/tenant-core.ts";

const { Schema, model, models } = mongoose;

const marketSchema = new Schema({
  code: { type: String, required: true, unique: true, uppercase: true, maxlength: 2 },
  legalBasisByChannel: { type: Schema.Types.Mixed, required: true },
  retentionDays: { type: Number, required: true, min: 1 },
  softOptIn: { type: Boolean, required: true },
  currency: { type: String, required: true, maxlength: 3 },
  locale: { type: String, required: true, maxlength: 16 },
  referencePriceDays: { type: Number, required: true, min: 1, max: 365 },
}, { timestamps: true, versionKey: false, collection: "markets" });

const sellerSettingsSchema = new Schema({
  sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", unique: true },
  marketCode: { type: String, required: true, uppercase: true, default: "HU" },
  settings: { type: Schema.Types.Mixed, required: true },
  version: { type: Number, required: true, min: 1, default: 1 },
  updatedByUserId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
}, { timestamps: true, versionKey: false, collection: "seller_settings" });
sellerScopedSchema(sellerSettingsSchema);

export const Market = models.Market || model("Market", marketSchema);
export const SellerSettingsModel = models.SellerSettings || model("SellerSettings", sellerSettingsSchema);
export const settingsModelsForIndexes = [Market, SellerSettingsModel];
