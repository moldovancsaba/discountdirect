import mongoose from "mongoose";

const { Schema, model, models } = mongoose;
const timestamps = { timestamps: true, versionKey: false } as const;
const deliveryStatuses = ["queued", "processing", "sent", "unsupported", "suppressed", "retryable_failed", "cancelled", "bounced", "complained"] as const;

const deliveryOutboxSchema = new Schema(
  {
    sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
    buyerUserId: { type: Schema.Types.ObjectId, required: true, ref: "User", index: true },
    customerId: { type: Schema.Types.ObjectId, default: null, ref: "Customer" },
    offerId: { type: Schema.Types.ObjectId, default: null, ref: "Offer", index: true },
    campaignId: { type: Schema.Types.ObjectId, default: null, ref: "Campaign", index: true },
    automationId: { type: Schema.Types.ObjectId, default: null, ref: "OfferAutomation", index: true },
    automationRunId: { type: Schema.Types.ObjectId, default: null, ref: "OfferAutomationRun", index: true },
    offerListId: { type: Schema.Types.ObjectId, default: null, ref: "OfferList", index: true },
    kind: { type: String, enum: ["personal_offer", "flash_campaign", "automated_list", "printable_letter"], required: true },
    channel: { type: String, enum: ["email", "postal"], required: true },
    status: { type: String, enum: deliveryStatuses, required: true, index: true },
    reasonCode: { type: String, required: true, maxlength: 120 },
    idempotencyKey: { type: String, required: true, maxlength: 180 },
    contentSnapshot: { type: Schema.Types.Mixed, required: true },
    provider: { type: String, default: null, maxlength: 40, index: true },
    providerMessageId: { type: String, default: null, maxlength: 160, index: true },
    providerThreadId: { type: String, default: null, maxlength: 160 },
    sentAt: { type: Date, default: null },
    lastProviderEventAt: { type: Date, default: null },
    attemptCount: { type: Number, required: true, default: 0, min: 0 },
    maxAttempts: { type: Number, required: true, default: 3, min: 1, max: 10 },
    nextAttemptAt: { type: Date, default: null, index: true },
    lastAttemptAt: { type: Date, default: null },
    lockedUntil: { type: Date, default: null },
    lockedBy: { type: String, default: null, maxlength: 120 },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    createdByUserId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  },
  { ...timestamps, collection: "delivery_outbox" },
);
deliveryOutboxSchema.index({ sellerId: 1, idempotencyKey: 1 }, { unique: true });
deliveryOutboxSchema.index({ sellerId: 1, status: 1, createdAt: -1, _id: -1 });
deliveryOutboxSchema.index({ buyerUserId: 1, createdAt: -1, _id: -1 });
deliveryOutboxSchema.index(
  { provider: 1, providerMessageId: 1 },
  { partialFilterExpression: { provider: { $type: "string" }, providerMessageId: { $type: "string" } } },
);

const deliveryEventSchema = new Schema(
  {
    deliveryId: { type: Schema.Types.ObjectId, required: true, ref: "DeliveryOutbox", index: true },
    sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
    status: { type: String, enum: deliveryStatuses, required: true },
    reasonCode: { type: String, required: true, maxlength: 120 },
    occurredAt: { type: Date, required: true },
    actorUserId: { type: Schema.Types.ObjectId, default: null, ref: "User" },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: "delivery_events" },
);
deliveryEventSchema.index({ deliveryId: 1, occurredAt: 1, _id: 1 });

const deliverySuppressionSchema = new Schema(
  {
    scope: { type: String, enum: ["seller", "global"], required: true, default: "seller" },
    sellerId: { type: Schema.Types.ObjectId, default: null, ref: "Seller", index: true },
    buyerUserId: { type: Schema.Types.ObjectId, required: true, ref: "User", index: true },
    channel: { type: String, enum: ["email", "postal"], required: true },
    reason: { type: String, enum: ["unsubscribe", "objection", "hard_bounce", "complaint", "provider_suppression"], required: true },
    sourceDeliveryId: { type: Schema.Types.ObjectId, default: null, ref: "DeliveryOutbox" },
    provider: { type: String, default: null, maxlength: 40 },
    providerEventId: { type: String, default: null, maxlength: 160 },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { versionKey: false, collection: "delivery_suppressions" },
);
deliverySuppressionSchema.index({ scope: 1, sellerId: 1, buyerUserId: 1, channel: 1 }, { unique: true });
deliverySuppressionSchema.index({ buyerUserId: 1, channel: 1, createdAt: -1 });

const deliveryWebhookEventSchema = new Schema(
  {
    provider: { type: String, enum: ["resend"], required: true },
    providerEventId: { type: String, required: true, maxlength: 160 },
    providerMessageId: { type: String, default: null, maxlength: 160, index: true },
    deliveryId: { type: Schema.Types.ObjectId, default: null, ref: "DeliveryOutbox", index: true },
    sellerId: { type: Schema.Types.ObjectId, default: null, ref: "Seller", index: true },
    type: { type: String, required: true, maxlength: 80 },
    action: { type: String, required: true, maxlength: 80 },
    reasonCode: { type: String, required: true, maxlength: 120 },
    payloadHash: { type: String, required: true, maxlength: 64 },
    occurredAt: { type: Date, required: true },
    processedAt: { type: Date, required: true, default: Date.now },
  },
  { versionKey: false, collection: "delivery_webhook_events" },
);
deliveryWebhookEventSchema.index({ provider: 1, providerEventId: 1 }, { unique: true });
deliveryWebhookEventSchema.index({ occurredAt: -1, _id: -1 });

export const DeliveryOutbox = models.DeliveryOutbox || model("DeliveryOutbox", deliveryOutboxSchema);
export const DeliveryEvent = models.DeliveryEvent || model("DeliveryEvent", deliveryEventSchema);
export const DeliverySuppression = models.DeliverySuppression || model("DeliverySuppression", deliverySuppressionSchema);
export const DeliveryWebhookEvent = models.DeliveryWebhookEvent || model("DeliveryWebhookEvent", deliveryWebhookEventSchema);
export const deliveryModels = [DeliveryOutbox, DeliveryEvent, DeliverySuppression, DeliveryWebhookEvent];
