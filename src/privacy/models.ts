import mongoose from "mongoose";

const { Schema, model, models } = mongoose;
const timestamps = { timestamps: true, versionKey: false } as const;

const channelPreferenceSchema = new Schema(
  {
    sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
    buyerUserId: { type: Schema.Types.ObjectId, required: true, ref: "User", index: true },
    customerId: { type: Schema.Types.ObjectId, default: null, ref: "Customer" },
    channel: { type: String, enum: ["email", "postal"], required: true },
    purpose: { type: String, enum: ["marketing"], default: "marketing", required: true },
    status: { type: String, enum: ["subscribed", "unsubscribed"], default: "unsubscribed", required: true },
    noticeVersion: { type: String, required: true, maxlength: 100 },
    changedAt: { type: Date, required: true },
  },
  { ...timestamps, collection: "channel_preferences" },
);
channelPreferenceSchema.index({ sellerId: 1, buyerUserId: 1, channel: 1, purpose: 1 }, { unique: true });

const consentEventSchema = new Schema(
  {
    sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
    buyerUserId: { type: Schema.Types.ObjectId, required: true, ref: "User", index: true },
    customerId: { type: Schema.Types.ObjectId, default: null, ref: "Customer" },
    channel: { type: String, enum: ["email", "postal"], required: true },
    purpose: { type: String, enum: ["marketing"], default: "marketing", required: true },
    action: { type: String, enum: ["granted", "withdrawn"], required: true },
    noticeVersion: { type: String, required: true, maxlength: 100 },
    occurredAt: { type: Date, required: true },
    actorUserId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: "consent_events" },
);
consentEventSchema.index({ sellerId: 1, buyerUserId: 1, occurredAt: -1, _id: -1 });

const privacyRequestSchema = new Schema(
  {
    sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
    buyerUserId: { type: Schema.Types.ObjectId, required: true, ref: "User", index: true },
    customerId: { type: Schema.Types.ObjectId, default: null, ref: "Customer" },
    type: { type: String, enum: ["access_export", "restriction", "erasure"], required: true },
    openKey: { type: String, default: null },
    status: { type: String, enum: ["requested", "processing", "completed", "failed"], default: "requested", index: true },
    requestedAt: { type: Date, required: true },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    handledByUserId: { type: Schema.Types.ObjectId, default: null, ref: "User" },
    resolution: { type: String, default: null, maxlength: 500 },
  },
  { ...timestamps, collection: "privacy_requests" },
);
privacyRequestSchema.index({ sellerId: 1, buyerUserId: 1, requestedAt: -1, _id: -1 });
privacyRequestSchema.index({ openKey: 1 }, { unique: true, partialFilterExpression: { openKey: { $type: "string" } } });

const privacyExportSchema = new Schema(
  {
    requestId: { type: Schema.Types.ObjectId, required: true, unique: true, ref: "PrivacyRequest" },
    sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
    buyerUserId: { type: Schema.Types.ObjectId, required: true, ref: "User", index: true },
    payload: { type: Schema.Types.Mixed, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: "privacy_exports" },
);
privacyExportSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ChannelPreference = models.ChannelPreference || model("ChannelPreference", channelPreferenceSchema);
export const ConsentEvent = models.ConsentEvent || model("ConsentEvent", consentEventSchema);
export const PrivacyRequest = models.PrivacyRequest || model("PrivacyRequest", privacyRequestSchema);
export const PrivacyExport = models.PrivacyExport || model("PrivacyExport", privacyExportSchema);
export const privacyModels = [ChannelPreference, ConsentEvent, PrivacyRequest, PrivacyExport];
