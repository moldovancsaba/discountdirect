import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose documents are normalized at this boundary. */
import mongoose from "mongoose";
import { BuyerRelationship, Membership, Seller } from "@/auth/models";
import { connectDatabase } from "@/lib/database";
import { mayDeliverMarketing } from "@/privacy/service";
import { DeliveryEvent, DeliveryOutbox } from "./models";

export class DeliveryError extends Error {
  constructor(public code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT") { super(code); }
}

type DeliveryChannel = "email" | "postal";
type DeliveryKind = "personal_offer" | "flash_campaign" | "automated_list" | "printable_letter";

function transportState(channel: DeliveryChannel) {
  const configured = channel === "email" ? process.env.EMAIL_DELIVERY_PROVIDER : process.env.POSTAL_DELIVERY_PROVIDER;
  return configured ? { status: "queued" as const, reasonCode: "READY_FOR_CONFIGURED_TRANSPORT" } : { status: "unsupported" as const, reasonCode: "TRANSPORT_NOT_CONFIGURED" };
}

function output(row: any) {
  return {
    id: row._id.toString(),
    kind: row.kind,
    channel: row.channel,
    status: row.status,
    reasonCode: row.reasonCode,
    attemptCount: row.attemptCount,
    nextAttemptAt: row.nextAttemptAt ?? null,
    completedAt: row.completedAt ?? null,
    cancelledAt: row.cancelledAt ?? null,
    createdAt: row.createdAt,
    offerId: row.offerId?.toString?.() ?? null,
    campaignId: row.campaignId?.toString?.() ?? null,
    automationId: row.automationId?.toString?.() ?? null,
    automationRunId: row.automationRunId?.toString?.() ?? null,
    offerListId: row.offerListId?.toString?.() ?? null,
    contentSnapshot: row.contentSnapshot,
  };
}

async function sellerAccess(userId: string, sellerSlug: string) {
  await connectDatabase();
  const seller = await Seller.findOne({ slug: sellerSlug, status: "active" }).lean();
  if (!seller) throw new DeliveryError("NOT_FOUND");
  if (!await Membership.exists({ sellerId: seller._id, userId, status: "active" })) throw new DeliveryError("FORBIDDEN");
  return seller;
}

export async function createDeliveryRecord(session: mongoose.ClientSession, input: {
  sellerId: unknown;
  buyerUserId: unknown;
  customerId?: unknown;
  offerId?: unknown;
  campaignId?: unknown;
  automationId?: unknown;
  automationRunId?: unknown;
  offerListId?: unknown;
  kind: DeliveryKind;
  channel: DeliveryChannel;
  idempotencyKey: string;
  contentSnapshot: Record<string, unknown>;
  createdByUserId: unknown;
}) {
  const allowed = await mayDeliverMarketing(String(input.sellerId), String(input.buyerUserId), input.channel);
  const state = allowed ? transportState(input.channel) : { status: "suppressed" as const, reasonCode: "NO_CURRENT_CHANNEL_CONSENT" };
  const now = new Date();
  const [row] = await DeliveryOutbox.create([{
    sellerId: input.sellerId,
    buyerUserId: input.buyerUserId,
    customerId: input.customerId ?? null,
    offerId: input.offerId ?? null,
    campaignId: input.campaignId ?? null,
    automationId: input.automationId ?? null,
    automationRunId: input.automationRunId ?? null,
    offerListId: input.offerListId ?? null,
    kind: input.kind,
    channel: input.channel,
    idempotencyKey: input.idempotencyKey,
    contentSnapshot: input.contentSnapshot,
    createdByUserId: input.createdByUserId,
    status: state.status,
    reasonCode: state.reasonCode,
    nextAttemptAt: state.status === "queued" ? now : null,
    completedAt: ["unsupported", "suppressed"].includes(state.status) ? now : null,
  }], { session });
  await DeliveryEvent.create([{ deliveryId: row._id, sellerId: input.sellerId, status: row.status, reasonCode: row.reasonCode, occurredAt: now, actorUserId: input.createdByUserId }], { session });
  return row;
}

export async function listSellerDeliveries(userId: string, sellerSlug: string) {
  const seller = await sellerAccess(userId, sellerSlug);
  const rows = await DeliveryOutbox.find({ sellerId: seller._id }).sort({ createdAt: -1, _id: -1 }).limit(100).lean();
  return { seller: { id: seller._id.toString(), name: seller.name, slug: seller.slug }, deliveries: rows.map(output) };
}

export async function buyerDeliveries(userId: string, sellerSlug?: string) {
  await connectDatabase();
  const filter: Record<string, unknown> = { buyerUserId: userId };
  if (sellerSlug) {
    const seller = await Seller.findOne({ slug: sellerSlug, status: "active" }).lean();
    if (!seller) throw new DeliveryError("NOT_FOUND");
    if (!await BuyerRelationship.exists({ sellerId: seller._id, buyerUserId: userId, status: "active" })) throw new DeliveryError("FORBIDDEN");
    filter.sellerId = seller._id;
  }
  const rows = await DeliveryOutbox.find(filter).sort({ createdAt: -1, _id: -1 }).limit(100).lean();
  return { deliveries: rows.map(output) };
}

export async function cancelBuyerDeliveries(session: mongoose.ClientSession, sellerId: unknown, buyerUserId: unknown, reasonCode: string, actorUserId: string) {
  const now = new Date();
  const rows = await DeliveryOutbox.find({ sellerId, buyerUserId, status: { $in: ["queued", "processing", "retryable_failed"] } }).session(session);
  for (const row of rows) {
    row.status = "cancelled";
    row.reasonCode = reasonCode;
    row.cancelledAt = now;
    row.nextAttemptAt = null;
    row.lockedUntil = null;
    row.lockedBy = null;
    await row.save({ session });
    await DeliveryEvent.create([{ deliveryId: row._id, sellerId, status: "cancelled", reasonCode, occurredAt: now, actorUserId }], { session });
  }
  return rows.length;
}

export async function deliverySummary() {
  await connectDatabase();
  const rows = await DeliveryOutbox.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]);
  return Object.fromEntries(rows.map((row: { _id: string; count: number }) => [row._id, row.count])) as Record<string, number>;
}
