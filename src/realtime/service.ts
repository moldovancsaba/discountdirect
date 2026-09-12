import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose change stream data is normalized at this boundary. */
import mongoose from "mongoose";
import { connectDatabase } from "@/lib/database";
import { ConversationPresence, RealtimeEvent } from "./models";
import type { RealtimeEventPayload, RealtimeEventType } from "./contracts";

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const PRESENCE_MS = 90_000;

export class RealtimeError extends Error {
  constructor(public code: "DISABLED" | "INVALID" | "FORBIDDEN" | "NOT_FOUND") { super(code); }
}

export function realtimeEnabled() {
  return process.env.REALTIME_ENABLED === "true";
}

function cursor(value?: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || typeof parsed.at !== "string" || !mongoose.isValidObjectId(parsed.id) || Number.isNaN(new Date(parsed.at).getTime())) return null;
    return { at: new Date(parsed.at), id: parsed.id };
  } catch { return null; }
}

function eventOutput(event: any): RealtimeEventPayload {
  return { eventId: event._id.toString(), conversationId: event.conversationId.toString(), type: event.type, version: event.version, occurredAt: event.occurredAt.toISOString(), messageId: event.messageId?.toString() ?? null };
}

export async function recordRealtimeEvent(session: mongoose.ClientSession, input: { sellerId: unknown; conversationId: unknown; type: RealtimeEventType; version: number; messageId?: unknown; occurredAt: Date }) {
  await RealtimeEvent.create([{ ...input, messageId: input.messageId ?? null, expiresAt: new Date(input.occurredAt.getTime() + RETENTION_MS) }], { session });
}

async function recordPresenceChange(conversation: { _id: unknown; sellerId: unknown; version: number }, occurredAt: Date) {
  await RealtimeEvent.create({ sellerId: conversation.sellerId, conversationId: conversation._id, type: "presence.changed", version: conversation.version, occurredAt, expiresAt: new Date(occurredAt.getTime() + RETENTION_MS) });
}

export async function realtimeConversationAccess(userId: string, conversationId: string) {
  if (!mongoose.isValidObjectId(conversationId)) throw new RealtimeError("INVALID");
  const { participant } = await import("@/messaging/service");
  try { return await participant(userId, conversationId); }
  catch (error) {
    const { MessagingError } = await import("@/messaging/service");
    if (error instanceof MessagingError) throw new RealtimeError(error.code === "INVALID" ? "INVALID" : error.code);
    throw error;
  }
}

export async function replayRealtimeEvents(userId: string, conversationId: string, cursorValue?: string | null) {
  const access = await realtimeConversationAccess(userId, conversationId);
  const parsed = cursor(cursorValue);
  if (cursorValue && !parsed) throw new RealtimeError("INVALID");
  const after = parsed ? { $or: [{ occurredAt: { $gt: parsed.at } }, { occurredAt: parsed.at, _id: { $gt: parsed.id } }] } : {};
  const rows = await RealtimeEvent.find({ conversationId: access.conversation._id, ...after }).sort({ occurredAt: 1, _id: 1 }).limit(101).lean();
  const page = rows.slice(0, 100);
  const last = page.at(-1);
  return { events: page.map(eventOutput), nextCursor: rows.length > 100 && last ? Buffer.from(JSON.stringify({ at: last.occurredAt.toISOString(), id: last._id.toString() })).toString("base64url") : null };
}

export async function heartbeatPresence(userId: string, conversationId: string) {
  const access = await realtimeConversationAccess(userId, conversationId);
  const now = new Date();
  const prior = await ConversationPresence.findOne({ conversationId: access.conversation._id, userId }).lean();
  await ConversationPresence.findOneAndUpdate({ conversationId: access.conversation._id, userId }, { $set: { sellerId: access.conversation.sellerId, expiresAt: new Date(now.getTime() + PRESENCE_MS), updatedAt: now } }, { upsert: true, new: true });
  if (!prior) await recordPresenceChange(access.conversation, now);
  return access;
}

export async function removePresence(userId: string, conversationId: string) {
  if (!mongoose.isValidObjectId(conversationId)) return;
  const access = await realtimeConversationAccess(userId, conversationId).catch(() => null);
  const removed = await ConversationPresence.deleteOne({ conversationId, userId });
  if (access && removed.deletedCount) await recordPresenceChange(access.conversation, new Date());
}

export async function presenceForParticipant(userId: string, conversationId: string) {
  const access = await realtimeConversationAccess(userId, conversationId);
  const rows = await ConversationPresence.find({ conversationId: access.conversation._id, expiresAt: { $gt: new Date() } }).lean();
  return { activeUserIds: rows.map((row) => row.userId.toString()) };
}

export async function eventPayloadFromChange(change: any) {
  const document = change.fullDocument;
  if (!document) return null;
  return eventOutput(document);
}

export async function watchRealtimeEvents(onEvent: (event: RealtimeEventPayload) => void) {
  await connectDatabase();
  const stream = RealtimeEvent.watch([], { fullDocument: "updateLookup" });
  stream.on("change", (change: unknown) => { void eventPayloadFromChange(change).then((event) => { if (event) onEvent(event); }); });
  return stream;
}
