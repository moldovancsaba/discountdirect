import mongoose from "mongoose";
import { sellerScopedSchema } from "../lib/tenant-core.ts";

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
  templateKey: { type: String, required: true, default: "hu-commerce-default", maxlength: 80 },
  templateVersion: { type: Number, required: true, default: 1, min: 1 },
  overrideMode: { type: String, enum: ["predefined", "advanced"], required: true, default: "predefined" },
  overrideValues: { type: Schema.Types.Mixed, required: true, default: {} },
  legalLocks: [{ type: String }],
}, { timestamps: true, versionKey: false, collection: "seller_settings" });
sellerScopedSchema(sellerSettingsSchema);

const ruleTemplateSchema = new Schema({ key: { type: String, required: true, unique: true, maxlength: 80 }, area: { type: String, required: true, maxlength: 80 }, name: { type: String, required: true, maxlength: 160 }, status: { type: String, enum: ["active", "retired"], required: true, default: "active" }, activeVersion: { type: Number, required: true, min: 1 }, updatedByUserId: { type: Schema.Types.ObjectId, required: true, ref: "User" } }, { timestamps: true, versionKey: false, collection: "rule_templates" });
const ruleTemplateVersionSchema = new Schema({ templateKey: { type: String, required: true, maxlength: 80 }, version: { type: Number, required: true, min: 1 }, values: { type: Schema.Types.Mixed, required: true }, legalLocks: [{ type: String }], status: { type: String, enum: ["published", "retired"], required: true, default: "published" }, publishedByUserId: { type: Schema.Types.ObjectId, required: true, ref: "User" }, publishedAt: { type: Date, required: true }, retiredByUserId: { type: Schema.Types.ObjectId, ref: "User" }, retiredAt: Date }, { versionKey: false, collection: "rule_template_versions" });
ruleTemplateVersionSchema.index({ templateKey: 1, version: 1 }, { unique: true });
const ruleResolutionEventSchema = new Schema({ sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true }, templateKey: { type: String, required: true }, templateVersion: { type: Number, required: true }, overrideVersion: { type: Number, required: true }, overrideMode: { type: String, enum: ["predefined", "advanced"], required: true }, legalLocks: [{ type: String }], changedPaths: [{ type: String }], resolvedHash: { type: String, required: true, minlength: 64, maxlength: 64 }, actorUserId: { type: Schema.Types.ObjectId, required: true, ref: "User" }, occurredAt: { type: Date, required: true } }, { versionKey: false, collection: "rule_resolution_events" });
ruleResolutionEventSchema.index({ sellerId: 1, occurredAt: -1, _id: -1 }); ruleResolutionEventSchema.plugin(sellerScopedSchema);

export const Market = models.Market || model("Market", marketSchema);
export const SellerSettingsModel = models.SellerSettings || model("SellerSettings", sellerSettingsSchema);
export const RuleTemplate = models.RuleTemplate || model("RuleTemplate", ruleTemplateSchema);
export const RuleTemplateVersion = models.RuleTemplateVersion || model("RuleTemplateVersion", ruleTemplateVersionSchema);
export const RuleResolutionEvent = models.RuleResolutionEvent || model("RuleResolutionEvent", ruleResolutionEventSchema);
export const settingsModelsForIndexes = [Market, SellerSettingsModel, RuleTemplate, RuleTemplateVersion, RuleResolutionEvent];
