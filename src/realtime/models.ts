import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

const realtimeEventSchema = new Schema(
  {
    sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
    conversationId: { type: Schema.Types.ObjectId, required: true, ref: "Conversation", index: true },
    type: { type: String, enum: ["message.created", "offer.updated", "presence.changed"], required: true },
    version: { type: Number, required: true, min: 1 },
    messageId: { type: Schema.Types.ObjectId, default: null, ref: "ConversationEvent" },
    occurredAt: { type: Date, required: true, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false, collection: "realtime_events" },
);
realtimeEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
realtimeEventSchema.index({ conversationId: 1, occurredAt: 1, _id: 1 });

const conversationPresenceSchema = new Schema(
  {
    sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller", index: true },
    conversationId: { type: Schema.Types.ObjectId, required: true, ref: "Conversation", index: true },
    userId: { type: Schema.Types.ObjectId, required: true, ref: "User", index: true },
    expiresAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true, default: Date.now },
  },
  { versionKey: false, collection: "conversation_presence" },
);
conversationPresenceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
conversationPresenceSchema.index({ conversationId: 1, userId: 1 }, { unique: true });

export const RealtimeEvent = models.RealtimeEvent || model("RealtimeEvent", realtimeEventSchema);
export const ConversationPresence = models.ConversationPresence || model("ConversationPresence", conversationPresenceSchema);
export const realtimeModels = [RealtimeEvent, ConversationPresence];
