import mongoose from "mongoose";

const { Schema, model, models } = mongoose;
const timestamps = { timestamps: true, versionKey: false } as const;

const conversationSchema = new Schema(
  {
    sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
    buyerUserId: { type: Schema.Types.ObjectId, required: true, ref: "User", index: true },
    customerId: { type: Schema.Types.ObjectId, default: null, ref: "Customer" },
    lastEventAt: { type: Date, required: true, default: Date.now },
    lastEventPreview: { type: String, required: true, default: "Beszélgetés megnyitva", maxlength: 240 },
    sellerUnreadCount: { type: Number, required: true, default: 0, min: 0 },
    buyerUnreadCount: { type: Number, required: true, default: 0, min: 0 },
    pendingOfferCount: { type: Number, required: true, default: 0, min: 0 },
    version: { type: Number, required: true, default: 1, min: 1 },
  },
  { ...timestamps, collection: "conversations" },
);
conversationSchema.index({ sellerId: 1, buyerUserId: 1 }, { unique: true });
conversationSchema.index({ sellerId: 1, lastEventAt: -1, _id: -1 });
conversationSchema.index({ buyerUserId: 1, lastEventAt: -1, _id: -1 });

const conversationEventSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, required: true, ref: "Conversation", index: true },
    sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
    kind: { type: String, enum: ["message", "activity"], required: true },
    senderRole: { type: String, enum: ["seller", "buyer", "system"], required: true },
    senderUserId: { type: Schema.Types.ObjectId, default: null, ref: "User" },
    body: { type: String, default: null, maxlength: 2000 },
    activityType: { type: String, default: null, maxlength: 80 },
    clientRequestId: { type: String, default: null, maxlength: 120 },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { versionKey: false, collection: "conversation_events" },
);
conversationEventSchema.index({ conversationId: 1, createdAt: -1, _id: -1 });
conversationEventSchema.index(
  { conversationId: 1, senderUserId: 1, clientRequestId: 1 },
  { unique: true, partialFilterExpression: { clientRequestId: { $type: "string" } } },
);

export const Conversation = models.Conversation || model("Conversation", conversationSchema);
export const ConversationEvent = models.ConversationEvent || model("ConversationEvent", conversationEventSchema);
export const messagingModels = [Conversation, ConversationEvent];
