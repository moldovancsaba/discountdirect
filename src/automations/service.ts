import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose documents are normalized at this boundary. */
import mongoose from "mongoose";
import { BuyerRelationship, Membership, Seller, User } from "@/auth/models";
import { connectDatabase } from "@/lib/database";
import { createDeliveryRecord } from "@/delivery/service";
import { Customer } from "@/purchases/models";
import { createRecommendationPreview } from "@/recommendations/service";
import { OfferAutomation, OfferAutomationRun, OfferList } from "./models";

export class AutomationError extends Error {
  constructor(public code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT") { super(code); }
}

type Cadence = "weekly" | "fortnightly" | "monthly";
type Channel = "email" | "postal";
const MAX_INITIAL_DAYS = 366;

function addCadence(from: Date, cadence: Cadence) {
  const next = new Date(from);
  if (cadence === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  if (cadence === "fortnightly") next.setUTCDate(next.getUTCDate() + 14);
  if (cadence === "monthly") next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

function outputAutomation(row: any) {
  return {
    id: row._id.toString(),
    customerId: row.customerId.toString(),
    buyerUserId: row.buyerUserId.toString(),
    channel: row.channel,
    cadence: row.cadence,
    status: row.status,
    nextRunAt: row.nextRunAt,
    lastRunAt: row.lastRunAt ?? null,
    productLimit: row.productLimit,
    version: row.version,
    createdAt: row.createdAt,
  };
}

function outputList(row: any) {
  return {
    id: row._id.toString(),
    sellerId: row.sellerId.toString(),
    buyerUserId: row.buyerUserId.toString(),
    customerId: row.customerId.toString(),
    automationId: row.automationId?.toString?.() ?? null,
    automationRunId: row.automationRunId?.toString?.() ?? null,
    channel: row.channel,
    title: row.title,
    status: row.status,
    products: row.products.map((item: any) => ({
      productId: item.productId.toString(),
      productVersion: item.productVersion,
      productSku: item.productSku,
      productName: item.productName,
      priceHuf: item.priceHuf,
      reasonCode: item.reasonCode,
      reasonText: item.reasonText,
      evidencePurchaseIds: item.evidencePurchaseIds.map((id: any) => id.toString()),
    })),
    availableUntil: row.availableUntil,
    createdAt: row.createdAt,
  };
}

function outputRun(row: any) {
  return {
    id: row._id.toString(),
    automationId: row.automationId.toString(),
    status: row.status,
    reasonCode: row.reasonCode,
    scheduledFor: row.scheduledFor,
    offerListId: row.offerListId?.toString?.() ?? null,
    deliveryId: row.deliveryId?.toString?.() ?? null,
    startedAt: row.startedAt,
    completedAt: row.completedAt ?? null,
    failedAt: row.failedAt ?? null,
  };
}

async function sellerAccess(userId: string, sellerSlug: string) {
  await connectDatabase();
  const seller = await Seller.findOne({ slug: sellerSlug, status: "active" }).lean();
  if (!seller) throw new AutomationError("NOT_FOUND");
  if (!await Membership.exists({ sellerId: seller._id, userId, status: "active" })) throw new AutomationError("FORBIDDEN");
  return seller;
}

function createInput(input: unknown) {
  if (!input || typeof input !== "object") throw new AutomationError("INVALID");
  const value = input as Record<string, unknown>;
  if (!mongoose.isValidObjectId(value.customerId) || !["email", "postal"].includes(String(value.channel)) || !["weekly", "fortnightly", "monthly"].includes(String(value.cadence)) || !Number.isInteger(value.productLimit) || Number(value.productLimit) < 1 || Number(value.productLimit) > 10 || typeof value.clientRequestId !== "string" || !/^[A-Za-z0-9_-]{8,120}$/.test(value.clientRequestId) || typeof value.nextRunAt !== "string") throw new AutomationError("INVALID");
  const nextRunAt = new Date(value.nextRunAt);
  if (Number.isNaN(nextRunAt.getTime()) || nextRunAt.getTime() > Date.now() + MAX_INITIAL_DAYS * 24 * 60 * 60 * 1000) throw new AutomationError("INVALID");
  return { customerId: String(value.customerId), channel: String(value.channel) as Channel, cadence: String(value.cadence) as Cadence, productLimit: Number(value.productLimit), clientRequestId: value.clientRequestId, nextRunAt };
}

async function automationCustomer(sellerId: unknown, customerId: string) {
  const customer = await Customer.findOne({ _id: customerId, sellerId, privacyStatus: "active" }).lean();
  if (!customer?.emailNormalized) throw new AutomationError("NOT_FOUND");
  const buyer = await User.findOne({ emailNormalized: customer.emailNormalized, status: "active" }).lean();
  if (!buyer || !await BuyerRelationship.exists({ sellerId, buyerUserId: buyer._id, status: "active" })) throw new AutomationError("FORBIDDEN");
  return { customer, buyer };
}

export async function createAutomation(userId: string, sellerSlug: string, input: unknown) {
  const value = createInput(input);
  const seller = await sellerAccess(userId, sellerSlug);
  const existing = await OfferAutomation.findOne({ sellerId: seller._id, createdByUserId: userId, clientRequestId: value.clientRequestId }).lean();
  if (existing) return outputAutomation(existing);
  const { customer, buyer } = await automationCustomer(seller._id, value.customerId);
  try {
    const row = await OfferAutomation.create({ sellerId: seller._id, customerId: customer._id, buyerUserId: buyer._id, channel: value.channel, cadence: value.cadence, nextRunAt: value.nextRunAt, productLimit: value.productLimit, clientRequestId: value.clientRequestId, createdByUserId: userId });
    return outputAutomation(row.toObject());
  } catch (error: any) {
    if (error?.code === 11000) {
      const replay = await OfferAutomation.findOne({ sellerId: seller._id, createdByUserId: userId, clientRequestId: value.clientRequestId }).lean();
      if (replay) return outputAutomation(replay);
    }
    throw error;
  }
}

export async function listAutomations(userId: string, sellerSlug: string) {
  const seller = await sellerAccess(userId, sellerSlug);
  const [automations, lists, runs] = await Promise.all([
    OfferAutomation.find({ sellerId: seller._id }).sort({ nextRunAt: 1, _id: 1 }).limit(100).lean(),
    OfferList.find({ sellerId: seller._id }).sort({ createdAt: -1, _id: -1 }).limit(30).lean(),
    OfferAutomationRun.find({ sellerId: seller._id }).sort({ startedAt: -1, _id: -1 }).limit(30).lean(),
  ]);
  const customerIds = [...new Set(automations.map((row: any) => row.customerId.toString()).concat(lists.map((row: any) => row.customerId.toString())))];
  const customers = await Customer.find({ _id: { $in: customerIds } }).lean();
  const customerById = new Map(customers.map((row: any) => [row._id.toString(), row]));
  return {
    seller: { id: seller._id.toString(), name: seller.name, slug: seller.slug },
    automations: automations.map((row: any) => ({ ...outputAutomation(row), customerName: customerById.get(row.customerId.toString())?.displayName ?? "Ismeretlen vásárló" })),
    lists: lists.map((row) => ({ ...outputList(row), customerName: customerById.get(row.customerId.toString())?.displayName ?? "Ismeretlen vásárló" })),
    runs: runs.map(outputRun),
  };
}

export async function setAutomationStatus(userId: string, sellerSlug: string, automationId: string, status: unknown, expectedVersion: unknown) {
  if (!mongoose.isValidObjectId(automationId) || !["active", "paused"].includes(String(status)) || !Number.isInteger(expectedVersion)) throw new AutomationError("INVALID");
  const seller = await sellerAccess(userId, sellerSlug);
  const row = await OfferAutomation.findOneAndUpdate({ _id: automationId, sellerId: seller._id, version: expectedVersion }, { $set: { status }, $inc: { version: 1 } }, { new: true, runValidators: true });
  if (!row) throw new AutomationError(await OfferAutomation.exists({ _id: automationId, sellerId: seller._id }) ? "CONFLICT" : "NOT_FOUND");
  return outputAutomation(row.toObject());
}

export async function runAutomationNow(userId: string, sellerSlug: string, automationId: string) {
  if (!mongoose.isValidObjectId(automationId)) throw new AutomationError("INVALID");
  const seller = await sellerAccess(userId, sellerSlug);
  const automation = await OfferAutomation.findOne({ _id: automationId, sellerId: seller._id }).lean();
  if (!automation) throw new AutomationError("NOT_FOUND");
  return runAutomation(automation, userId, seller.slug);
}

async function runAutomation(automation: any, actorUserId: string, sellerSlug?: string) {
  if (automation.status !== "active") throw new AutomationError("CONFLICT");
  const seller = await Seller.findById(automation.sellerId).lean();
  if (!seller) throw new AutomationError("NOT_FOUND");
  const preview = await createRecommendationPreview(actorUserId, sellerSlug ?? seller.slug, automation.customerId.toString(), automation.channel);
  const products = preview.status === "eligible" ? preview.recommendations.slice(0, automation.productLimit) : [];
  const now = new Date();
  const database = await connectDatabase();
  let result: any;
  await database.connection.transaction(async (session) => {
    const [run] = await OfferAutomationRun.create([{ automationId: automation._id, sellerId: automation.sellerId, customerId: automation.customerId, buyerUserId: automation.buyerUserId, scheduledFor: automation.nextRunAt, status: products.length ? "completed" : "skipped", reasonCode: products.length ? "LIST_CREATED" : (preview.exclusionReasons[0] ?? "NO_RECOMMENDATIONS"), startedAt: now, completedAt: now }], { session });
    let offerList: any = null;
    let delivery: any = null;
    if (products.length) {
      const [created] = await OfferList.create([{ sellerId: automation.sellerId, buyerUserId: automation.buyerUserId, customerId: automation.customerId, automationId: automation._id, automationRunId: run._id, recommendationPreviewId: preview.id, channel: automation.channel, title: "Személyre szabott ajánlatlista", products: products.map((item: any) => ({ productId: item.productId, productVersion: item.productVersion, productSku: item.productSku, productName: item.productName, priceHuf: item.priceHuf, reasonCode: item.reasonCode, reasonText: item.reasonText, evidencePurchaseIds: item.evidencePurchaseIds })), availableUntil: addCadence(now, automation.cadence), createdByUserId: actorUserId }], { session });
      offerList = created;
      delivery = await createDeliveryRecord(session, { sellerId: automation.sellerId, buyerUserId: automation.buyerUserId, customerId: automation.customerId, automationId: automation._id, automationRunId: run._id, offerListId: created._id, kind: "automated_list", channel: automation.channel, idempotencyKey: `automation:${automation._id}:${run._id}`, contentSnapshot: { title: created.title, productCount: products.length, availableUntil: created.availableUntil }, createdByUserId: actorUserId });
      run.offerListId = created._id;
      run.deliveryId = delivery._id;
      await run.save({ session });
    }
    await OfferAutomation.updateOne({ _id: automation._id }, { $set: { lastRunAt: now, nextRunAt: addCadence(automation.nextRunAt > now ? automation.nextRunAt : now, automation.cadence) } }, { session });
    result = { run: outputRun(run.toObject()), list: offerList ? outputList(offerList.toObject()) : null, delivery: delivery ? { id: delivery._id.toString(), status: delivery.status, reasonCode: delivery.reasonCode } : null };
  });
  return result;
}

export async function runDueAutomations(limit = 20) {
  await connectDatabase();
  const rows = await OfferAutomation.find({ status: "active", nextRunAt: { $lte: new Date() } }).sort({ nextRunAt: 1, _id: 1 }).limit(Math.min(Math.max(limit, 1), 50)).lean();
  const results = [];
  for (const row of rows) {
    try { results.push(await runAutomation(row, row.createdByUserId.toString())); }
    catch (error) { results.push({ error: error instanceof Error ? error.message : "UNKNOWN", automationId: row._id.toString() }); }
  }
  return { processed: results.length, results };
}

export async function buyerOfferLists(userId: string) {
  await connectDatabase();
  const now = new Date();
  await OfferList.updateMany({ buyerUserId: userId, status: "active", availableUntil: { $lte: now } }, { $set: { status: "expired" } });
  const rows = await OfferList.find({ buyerUserId: userId }).sort({ createdAt: -1, _id: -1 }).limit(100).lean();
  return { lists: rows.map(outputList) };
}

export async function buyerOfferList(userId: string, listId: string) {
  if (!mongoose.isValidObjectId(listId)) throw new AutomationError("INVALID");
  await connectDatabase();
  const row = await OfferList.findOne({ _id: listId, buyerUserId: userId }).lean();
  if (!row) throw new AutomationError("NOT_FOUND");
  return outputList(row);
}

export async function automationSummary() {
  await connectDatabase();
  const [automations, runs, lists] = await Promise.all([
    OfferAutomation.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    OfferAutomationRun.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    OfferList.countDocuments({ status: "active", availableUntil: { $gt: new Date() } }),
  ]);
  return { automations: Object.fromEntries(automations.map((row: { _id: string; count: number }) => [row._id, row.count])), runs: Object.fromEntries(runs.map((row: { _id: string; count: number }) => [row._id, row.count])), activeLists: lists };
}
