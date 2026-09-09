import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose documents are normalized at this boundary. */
import mongoose from "mongoose";
import { BuyerRelationship, Membership, Seller, User } from "@/auth/models";
import { connectDatabase } from "@/lib/database";
import { Customer } from "@/purchases/models";
import { Conversation, ConversationEvent } from "./models";

export class MessagingError extends Error {
  constructor(public code: "FORBIDDEN" | "NOT_FOUND" | "INVALID") { super(code); }
}

type Cursor = { at: string; id: string };

function encodeCursor(row: { lastEventAt?: Date; createdAt?: Date; _id: { toString(): string } }) {
  return Buffer.from(JSON.stringify({ at: (row.lastEventAt ?? row.createdAt)!.toISOString(), id: row._id.toString() })).toString("base64url");
}

function decodeCursor(value?: string | null): Cursor | null {
  if (!value || value.length > 256) return null;
  try {
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!cursor || typeof cursor.at !== "string" || !mongoose.isValidObjectId(cursor.id) || Number.isNaN(new Date(cursor.at).getTime())) return null;
    return cursor;
  } catch { return null; }
}

function pageFilter(field: "lastEventAt" | "createdAt", cursor: Cursor | null) {
  if (!cursor) return {};
  const at = new Date(cursor.at);
  return { $or: [{ [field]: { $lt: at } }, { [field]: at, _id: { $lt: new mongoose.Types.ObjectId(cursor.id) } }] };
}

function messageInput(clientRequestId: unknown, body: unknown) {
  if (typeof clientRequestId !== "string" || !/^[A-Za-z0-9_-]{8,120}$/.test(clientRequestId) || typeof body !== "string") throw new MessagingError("INVALID");
  const text = body.trim();
  if (!text || text.length > 2000) throw new MessagingError("INVALID");
  return { clientRequestId, body: text };
}

async function sellerAccess(userId: string, sellerSlug: string) {
  await connectDatabase();
  const seller = await Seller.findOne({ slug: sellerSlug, status: "active" }).lean();
  if (!seller) throw new MessagingError("NOT_FOUND");
  if (!await Membership.exists({ sellerId: seller._id, userId, status: "active" })) throw new MessagingError("FORBIDDEN");
  return seller;
}

async function participant(userId: string, conversationId: string) {
  if (!mongoose.isValidObjectId(conversationId)) throw new MessagingError("INVALID");
  await connectDatabase();
  const conversation = await Conversation.findById(conversationId).lean();
  if (!conversation) throw new MessagingError("NOT_FOUND");
  const sellerMember = await Membership.exists({ sellerId: conversation.sellerId, userId, status: "active" });
  if (sellerMember) return { conversation, role: "seller" as const };
  if (conversation.buyerUserId.toString() !== userId) throw new MessagingError("FORBIDDEN");
  if (!await BuyerRelationship.exists({ sellerId: conversation.sellerId, buyerUserId: userId, status: "active" })) throw new MessagingError("FORBIDDEN");
  return { conversation, role: "buyer" as const };
}

function eventOutput(row: any) {
  return { id: row._id.toString(), kind: row.kind, senderRole: row.senderRole, body: row.body ?? null, activityType: row.activityType ?? null, createdAt: row.createdAt, clientRequestId: row.clientRequestId ?? null };
}

async function conversationOutput(row: any) {
  const [seller, buyer, customer] = await Promise.all([
    Seller.findById(row.sellerId).lean(), User.findById(row.buyerUserId).lean(), row.customerId ? Customer.findById(row.customerId).lean() : null,
  ]);
  if (!seller || !buyer) throw new MessagingError("NOT_FOUND");
  return {
    id: row._id.toString(), seller: { id: seller._id.toString(), name: seller.name, slug: seller.slug },
    buyer: { id: buyer._id.toString(), displayName: buyer.displayName },
    customer: customer ? { id: customer._id.toString(), displayName: customer.displayName } : null,
    lastEventAt: row.lastEventAt, lastEventPreview: row.lastEventPreview,
    sellerUnreadCount: row.sellerUnreadCount, buyerUnreadCount: row.buyerUnreadCount, pendingOfferCount: row.pendingOfferCount,
  };
}

export async function ensureConversation(userId: string, sellerSlug: string, customerId: string) {
  if (!mongoose.isValidObjectId(customerId)) throw new MessagingError("INVALID");
  const seller = await sellerAccess(userId, sellerSlug);
  const customer = await Customer.findOne({ _id: customerId, sellerId: seller._id, privacyStatus: { $ne: "erased" } }).lean();
  if (!customer?.emailNormalized) throw new MessagingError("NOT_FOUND");
  const buyer = await User.findOne({ emailNormalized: customer.emailNormalized, status: "active" }).lean();
  if (!buyer || !await BuyerRelationship.exists({ sellerId: seller._id, buyerUserId: buyer._id, status: "active" })) throw new MessagingError("FORBIDDEN");
  const existing = await Conversation.findOne({ sellerId: seller._id, buyerUserId: buyer._id }).lean();
  if (existing) return conversationOutput(existing);
  const database = await connectDatabase();
  try {
    let created: any;
    await database.connection.transaction(async (session) => {
      const now = new Date();
      const rows = await Conversation.create([{ sellerId: seller._id, buyerUserId: buyer._id, customerId: customer._id, lastEventAt: now, lastEventPreview: "Beszélgetés megnyitva" }], { session });
      created = rows[0];
      await ConversationEvent.create([{ conversationId: created._id, sellerId: seller._id, kind: "activity", senderRole: "system", activityType: "conversation_opened", createdAt: now }], { session });
    });
    return conversationOutput(created.toObject());
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
    const replay = await Conversation.findOne({ sellerId: seller._id, buyerUserId: buyer._id }).lean();
    if (!replay) throw error;
    return conversationOutput(replay);
  }
}

async function listConversations(filter: Record<string, unknown>, cursorValue?: string | null) {
  const cursor = decodeCursor(cursorValue);
  if (cursorValue && !cursor) throw new MessagingError("INVALID");
  const rows = await Conversation.find({ ...filter, ...pageFilter("lastEventAt", cursor) }).sort({ lastEventAt: -1, _id: -1 }).limit(51).lean();
  const page = rows.slice(0, 50);
  return { conversations: await Promise.all(page.map(conversationOutput)), nextCursor: rows.length > 50 ? encodeCursor(page[page.length - 1]) : null };
}

export async function sellerConversations(userId: string, sellerSlug: string, cursor?: string | null) {
  const seller = await sellerAccess(userId, sellerSlug);
  const listed = await listConversations({ sellerId: seller._id }, cursor);
  return { seller, ...listed };
}

export async function buyerConversations(userId: string, cursor?: string | null) {
  await connectDatabase();
  return listConversations({ buyerUserId: userId }, cursor);
}

export async function conversationTimeline(userId: string, conversationId: string, cursorValue?: string | null) {
  const access = await participant(userId, conversationId);
  const cursor = decodeCursor(cursorValue);
  if (cursorValue && !cursor) throw new MessagingError("INVALID");
  const rows = await ConversationEvent.find({ conversationId: access.conversation._id, ...pageFilter("createdAt", cursor) }).sort({ createdAt: -1, _id: -1 }).limit(51).lean();
  const page = rows.slice(0, 50);
  if (access.role === "seller") await Conversation.updateOne({ _id: access.conversation._id }, { $set: { sellerUnreadCount: 0 } });
  else await Conversation.updateOne({ _id: access.conversation._id }, { $set: { buyerUnreadCount: 0 } });
  return { conversation: await conversationOutput(access.conversation), role: access.role, events: page.reverse().map(eventOutput), nextCursor: rows.length > 50 ? encodeCursor(page[page.length - 1]) : null };
}

export async function sendConversationMessage(userId: string, conversationId: string, clientRequestId: unknown, body: unknown) {
  const input = messageInput(clientRequestId, body);
  const access = await participant(userId, conversationId);
  const database = await connectDatabase();
  let output: any;
  await database.connection.transaction(async (session) => {
    const existing = await ConversationEvent.findOne({ conversationId: access.conversation._id, senderUserId: userId, clientRequestId: input.clientRequestId }).session(session).lean();
    if (existing) { output = eventOutput(existing); return; }
    const now = new Date();
    const [created] = await ConversationEvent.create([{ conversationId: access.conversation._id, sellerId: access.conversation.sellerId, kind: "message", senderRole: access.role, senderUserId: userId, body: input.body, clientRequestId: input.clientRequestId, createdAt: now }], { session });
    await Conversation.updateOne({ _id: access.conversation._id }, { $set: { lastEventAt: now, lastEventPreview: input.body.slice(0, 240) }, $inc: access.role === "seller" ? { buyerUnreadCount: 1 } : { sellerUnreadCount: 1 } }, { session });
    output = eventOutput(created.toObject());
  });
  return output;
}
