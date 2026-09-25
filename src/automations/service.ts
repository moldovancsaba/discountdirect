import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose documents are normalized at this boundary. */
import mongoose from "mongoose";
import { BuyerRelationship, Membership, Seller, User } from "@/auth/models";
import { connectDatabase } from "@/lib/database";
import { withSellerTenant, withTenantBypass } from "@/lib/tenant";
import { createDeliveryRecord } from "@/delivery/service";
import { Customer } from "@/purchases/models";
import { createRecommendationPreview } from "@/recommendations/service";
import { OfferAutomation, OfferAutomationPreview, OfferAutomationRun, OfferList } from "./models";
import { NewsletterSnapshot, NewsletterTestSend } from "./models";
import { maySendMarketing } from "@/consent/service";
import { NEWSLETTER_TEMPLATE_VERSION, newsletterContentHash, newsletterItems } from "./newsletter-core";
import { SellerSettingsModel } from "@/settings/models";
import { validateSellerSettings } from "@/settings/validation";
import { isHoldout } from "@/campaigns/holdout";
import { emailTransportReadiness, sendResendTestEmail } from "@/delivery/email";

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

function outputAutomationPreview(row: any) {
  return {
    id: row._id.toString(),
    customerId: row.customerId.toString(),
    buyerUserId: row.buyerUserId.toString(),
    channel: row.channel,
    cadence: row.cadence,
    nextRunAt: row.nextRunAt,
    productLimit: row.productLimit,
    status: row.status,
    recommendationPreviewId: row.recommendationPreviewId?.toString?.() ?? null,
    exclusionReasons: row.exclusionReasons ?? [],
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
    scheduledAutomationId: row.scheduledAutomationId?.toString?.() ?? null,
    createdAt: row.createdAt,
    scheduledAt: row.scheduledAt ?? null,
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
    newsletterSnapshotId: row.newsletterSnapshotId?.toString?.() ?? null,
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

async function activeBuyerSellerIds(userId: string) {
  const rows = await BuyerRelationship.find({ buyerUserId: userId, status: "active" }).select({ sellerId: 1 }).lean();
  return rows.map((row) => row.sellerId);
}

function previewInput(input: unknown) {
  if (!input || typeof input !== "object") throw new AutomationError("INVALID");
  const value = input as Record<string, unknown>;
  if (!mongoose.isValidObjectId(value.customerId) || !["email", "postal"].includes(String(value.channel)) || !["weekly", "fortnightly", "monthly"].includes(String(value.cadence)) || !Number.isInteger(value.productLimit) || Number(value.productLimit) < 1 || Number(value.productLimit) > 10 || typeof value.nextRunAt !== "string") throw new AutomationError("INVALID");
  const nextRunAt = new Date(value.nextRunAt);
  if (Number.isNaN(nextRunAt.getTime()) || nextRunAt.getTime() > Date.now() + MAX_INITIAL_DAYS * 24 * 60 * 60 * 1000) throw new AutomationError("INVALID");
  return { customerId: String(value.customerId), channel: String(value.channel) as Channel, cadence: String(value.cadence) as Cadence, productLimit: Number(value.productLimit), nextRunAt };
}

function createInput(input: unknown) {
  if (!input || typeof input !== "object") throw new AutomationError("INVALID");
  const value = input as Record<string, unknown>;
  if (typeof value.clientRequestId !== "string" || !/^[A-Za-z0-9_-]{8,120}$/.test(value.clientRequestId)) throw new AutomationError("INVALID");
  return { ...previewInput(input), clientRequestId: value.clientRequestId };
}

async function automationCustomer(sellerId: unknown, customerId: string) {
  const customer = await Customer.findOne({ _id: customerId, sellerId, privacyStatus: "active" }).lean();
  if (!customer?.emailNormalized) throw new AutomationError("NOT_FOUND");
  const buyer = await User.findOne({ emailNormalized: customer.emailNormalized, status: "active" }).lean();
  if (!buyer || !await BuyerRelationship.exists({ sellerId, buyerUserId: buyer._id, status: "active" })) throw new AutomationError("FORBIDDEN");
  return { customer, buyer };
}

export async function createAutomationPreview(userId: string, sellerSlug: string, input: unknown) {
  const value = previewInput(input);
  const seller = await sellerAccess(userId, sellerSlug);
  const { customer, buyer } = await automationCustomer(seller._id, value.customerId);
  const recommendation = await createRecommendationPreview(userId, sellerSlug, customer._id.toString(), value.channel);
  const products = recommendation.status === "eligible" ? recommendation.recommendations.slice(0, value.productLimit) : [];
  const status = products.length ? "ready" : "blocked";
  const [row] = await OfferAutomationPreview.create([{
    sellerId: seller._id,
    customerId: customer._id,
    buyerUserId: buyer._id,
    channel: value.channel,
    cadence: value.cadence,
    nextRunAt: value.nextRunAt,
    productLimit: value.productLimit,
    status,
    recommendationPreviewId: recommendation.id,
    exclusionReasons: recommendation.status === "eligible" ? [] : recommendation.exclusionReasons.length ? recommendation.exclusionReasons : ["NO_RECOMMENDATIONS"],
    products: products.map((item: any) => ({ productId: item.productId, productVersion: item.productVersion, productSku: item.productSku, productName: item.productName, priceHuf: item.priceHuf, reasonCode: item.reasonCode, reasonText: item.reasonText, evidencePurchaseIds: item.evidencePurchaseIds })),
    createdByUserId: userId,
  }]);
  return outputAutomationPreview(row.toObject());
}

export async function getAutomationPreview(userId: string, sellerSlug: string, previewId: string) {
  const seller = await sellerAccess(userId, sellerSlug);
  if (!mongoose.isValidObjectId(previewId)) throw new AutomationError("NOT_FOUND");
  const row = await OfferAutomationPreview.findOne({ _id: previewId, sellerId: seller._id }).lean();
  if (!row) throw new AutomationError("NOT_FOUND");
  return outputAutomationPreview(row);
}

export async function sendAutomationPreviewTest(userId: string, sellerSlug: string, previewId: string) {
  const seller = await sellerAccess(userId, sellerSlug); const user = await User.findOne({ _id: userId, status: "active" }).lean();
  if (!user || !mongoose.isValidObjectId(previewId)) throw new AutomationError("NOT_FOUND");
  const preview = await OfferAutomationPreview.findOne({ _id: previewId, sellerId: seller._id, status: "ready", channel: "email" }).lean();
  if (!preview?.products.length) throw new AutomationError("CONFLICT");
  const items = newsletterItems(preview.products.map((item: any) => ({ productId: item.productId.toString(), productVersion: item.productVersion, productSku: item.productSku, productName: item.productName, priceHuf: item.priceHuf, reasonCode: item.reasonCode, reasonText: item.reasonText, evidencePurchaseIds: item.evidencePurchaseIds.map((id: any) => id.toString()) })));
  const contentHash = newsletterContentHash({ sellerId: seller._id.toString(), buyerUserId: userId, runId: preview._id.toString(), items, availableUntil: preview.nextRunAt });
  const existing = await NewsletterTestSend.findOne({ sellerId: seller._id, previewId: preview._id, actorUserId: userId, contentHash }).lean(); if (existing?.status === "sent") return { status: "sent", recipient: user.emailNormalized };
  const config = emailTransportReadiness(); if (!config.enabled) throw new AutomationError("CONFLICT");
  const row = existing ? await NewsletterTestSend.findOneAndUpdate({ _id: existing._id, sellerId: seller._id }, { $set: { status: "processing", reasonCode: "TEST_SEND_PROCESSING" } }, { new: true }) : await NewsletterTestSend.create({ sellerId: seller._id, previewId: preview._id, actorUserId: userId, recipient: user.emailNormalized, contentHash, templateVersion: NEWSLETTER_TEMPLATE_VERSION, status: "processing", reasonCode: "TEST_SEND_PROCESSING" });
  const lines = items.map((item) => `${item.productName} · ${item.priceHuf} Ft · ${item.reasonText}`); const subject = `[TESZT] ${seller.name}: személyre szabott ajánlatlista`; const text = [`Ez egy tesztküldés, vásárló nem kapta meg.`, ...lines].join("\n\n"); const html = `<p><strong>Ez egy tesztküldés, vásárló nem kapta meg.</strong></p><ul>${lines.map((line) => `<li>${line.replace(/[&<>]/g, (value) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[value]!)}</li>`).join("")}</ul>`;
  try { const sent = await sendResendTestEmail(config, { idempotencyKey: `newsletter-test:${row!._id}:${contentHash}`, recipient: user.emailNormalized, subject, text, html }); await NewsletterTestSend.updateOne({ _id: row!._id, sellerId: seller._id }, { $set: { status: "sent", reasonCode: "TEST_SEND_SENT", providerMessageId: sent.id, completedAt: new Date() } }); return { status: "sent", recipient: user.emailNormalized }; }
  catch (error) { await NewsletterTestSend.updateOne({ _id: row!._id, sellerId: seller._id }, { $set: { status: "failed", reasonCode: error instanceof Error ? error.message.slice(0, 120) : "TEST_SEND_FAILED", completedAt: new Date() } }); throw new AutomationError("CONFLICT"); }
}

export async function scheduleAutomationPreview(userId: string, sellerSlug: string, previewId: string, clientRequestId: unknown) {
  if (!mongoose.isValidObjectId(previewId) || typeof clientRequestId !== "string" || !/^[A-Za-z0-9_-]{8,120}$/.test(clientRequestId)) throw new AutomationError("INVALID");
  const seller = await sellerAccess(userId, sellerSlug);
  const existing = await OfferAutomation.findOne({ sellerId: seller._id, createdByUserId: userId, clientRequestId }).lean();
  if (existing) return outputAutomation(existing);
  const preview = await OfferAutomationPreview.findOne({ _id: previewId, sellerId: seller._id }).lean();
  if (!preview) throw new AutomationError("NOT_FOUND");
  if (preview.scheduledAutomationId) { const row = await OfferAutomation.findOne({ _id: preview.scheduledAutomationId, sellerId: seller._id }).lean(); if (row) return outputAutomation(row); }
  if (preview.status !== "ready") throw new AutomationError("CONFLICT");
  const database = await connectDatabase();
  let result: any;
  await database.connection.transaction(async (session) => {
    const [row] = await OfferAutomation.create([{ sellerId: seller._id, customerId: preview.customerId, buyerUserId: preview.buyerUserId, channel: preview.channel, cadence: preview.cadence, nextRunAt: preview.nextRunAt, productLimit: preview.productLimit, clientRequestId, createdByUserId: userId }], { session });
    await OfferAutomationPreview.updateOne({ _id: preview._id, sellerId: seller._id, status: "ready" }, { $set: { status: "scheduled", scheduledAutomationId: row._id, scheduledAt: new Date() } }, { session });
    result = outputAutomation(row.toObject());
  });
  return result;
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
  const customers = await Customer.find({ sellerId: seller._id, _id: { $in: customerIds } }).lean();
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
  return withSellerTenant(seller._id, () => runAutomation(automation, userId, seller.slug));
}

async function runAutomation(automation: any, actorUserId: string, sellerSlug?: string) {
  if (automation.status !== "active") throw new AutomationError("CONFLICT");
  const seller = await Seller.findById(automation.sellerId).lean();
  if (!seller) throw new AutomationError("NOT_FOUND");
  const sendDecision = await maySendMarketing(automation.sellerId.toString(), automation.buyerUserId.toString(), automation.channel);
  const storedSettings = await SellerSettingsModel.findOne({ sellerId: automation.sellerId }).lean();
  const settings = validateSellerSettings(storedSettings?.settings ?? {});
  const heldOut = isHoldout({ sellerId: automation.sellerId.toString(), buyerUserId: automation.buyerUserId.toString(), holdoutPct: settings.holdout_pct, mode: settings.holdout_mode, campaignKey: `newsletter:${automation._id}:${automation.nextRunAt.toISOString()}` });
  const eligibility = sendDecision.allowed && heldOut ? { allowed: false as const, reasonCode: "NEWSLETTER_HOLDOUT" } : sendDecision;
  const preview = eligibility.allowed ? await createRecommendationPreview(actorUserId, sellerSlug ?? seller.slug, automation.customerId.toString(), automation.channel) : { status: "excluded", recommendations: [], exclusionReasons: [eligibility.reasonCode] };
  const products = preview.status === "eligible" ? preview.recommendations.slice(0, automation.productLimit) : [];
  const now = new Date();
  const database = await connectDatabase();
  let result: any;
  await database.connection.transaction(async (session) => {
    const [run] = await OfferAutomationRun.create([{ automationId: automation._id, sellerId: automation.sellerId, customerId: automation.customerId, buyerUserId: automation.buyerUserId, scheduledFor: automation.nextRunAt, status: products.length ? "completed" : "skipped", reasonCode: products.length ? "LIST_CREATED" : (preview.exclusionReasons[0] ?? "NO_RECOMMENDATIONS"), startedAt: now, completedAt: now }], { session });
    let offerList: any = null;
    let delivery: any = null;
    if (products.length) {
      const [created] = await OfferList.create([{ sellerId: automation.sellerId, buyerUserId: automation.buyerUserId, customerId: automation.customerId, automationId: automation._id, automationRunId: run._id, recommendationPreviewId: "id" in preview ? preview.id : null, channel: automation.channel, title: "Személyre szabott ajánlatlista", products: products.map((item: any) => ({ productId: item.productId, productVersion: item.productVersion, productSku: item.productSku, productName: item.productName, priceHuf: item.priceHuf, reasonCode: item.reasonCode, reasonText: item.reasonText, evidencePurchaseIds: item.evidencePurchaseIds })), availableUntil: addCadence(now, automation.cadence), createdByUserId: actorUserId }], { session });
      offerList = created;
      const frozenItems = newsletterItems(products.map((item: any) => ({ productId: item.productId.toString(), productVersion: item.productVersion, productSku: item.productSku, productName: item.productName, priceHuf: item.priceHuf, reasonCode: item.reasonCode, reasonText: item.reasonText, evidencePurchaseIds: item.evidencePurchaseIds.map((id: any) => id.toString()) })));
      const [newsletter] = await NewsletterSnapshot.create([{ sellerId: automation.sellerId, automationId: automation._id, automationRunId: run._id, offerListId: created._id, buyerUserId: automation.buyerUserId, customerId: automation.customerId, channel: automation.channel, templateVersion: NEWSLETTER_TEMPLATE_VERSION, eligibilityReasonCode: eligibility.reasonCode, consentCheckedAt: now, items: frozenItems, availableUntil: created.availableUntil, contentHash: newsletterContentHash({ sellerId: automation.sellerId.toString(), buyerUserId: automation.buyerUserId.toString(), runId: run._id.toString(), items: frozenItems, availableUntil: created.availableUntil }) }], { session });
      const contentSnapshot = { newsletterSnapshotId: newsletter._id.toString(), templateVersion: NEWSLETTER_TEMPLATE_VERSION, contentHash: newsletter.contentHash, title: created.title, productCount: frozenItems.length, availableUntil: created.availableUntil, products: frozenItems.map((item) => ({ productName: item.productName, priceHuf: item.priceHuf, reasonText: item.reasonText })) };
      await createDeliveryRecord(session, { sellerId: automation.sellerId, buyerUserId: automation.buyerUserId, customerId: automation.customerId, automationId: automation._id, automationRunId: run._id, offerListId: created._id, kind: "automated_list", channel: "in_app", idempotencyKey: `automation:${automation._id}:${run._id}:in_app`, contentSnapshot, createdByUserId: actorUserId });
      delivery = await createDeliveryRecord(session, { sellerId: automation.sellerId, buyerUserId: automation.buyerUserId, customerId: automation.customerId, automationId: automation._id, automationRunId: run._id, offerListId: created._id, newsletterSnapshotId: newsletter._id, kind: "automated_list", channel: automation.channel, idempotencyKey: `automation:${automation._id}:${run._id}:${automation.channel}`, contentSnapshot, createdByUserId: actorUserId });
      newsletter.deliveryId = delivery._id; await newsletter.save({ session });
      run.offerListId = created._id;
      run.deliveryId = delivery._id;
      run.newsletterSnapshotId = newsletter._id;
      await run.save({ session });
    }
    await OfferAutomation.updateOne({ _id: automation._id, sellerId: automation.sellerId }, { $set: { lastRunAt: now, nextRunAt: addCadence(automation.nextRunAt > now ? automation.nextRunAt : now, automation.cadence) } }, { session });
    result = { run: outputRun(run.toObject()), list: offerList ? outputList(offerList.toObject()) : null, delivery: delivery ? { id: delivery._id.toString(), status: delivery.status, reasonCode: delivery.reasonCode } : null };
  });
  return result;
}

export async function runDueAutomations(limit = 20) {
  await connectDatabase();
  const rows = await withTenantBypass("automation-cron-global-due-scan", async () =>
    await OfferAutomation.find({ status: "active", nextRunAt: { $lte: new Date() } }).sort({ nextRunAt: 1, _id: 1 }).limit(Math.min(Math.max(limit, 1), 50)).lean(),
  );
  const results = [];
  for (const row of rows) {
    try { results.push(await withSellerTenant(row.sellerId, () => runAutomation(row, row.createdByUserId.toString()))); }
    catch (error) { results.push({ error: error instanceof Error ? error.message : "UNKNOWN", automationId: row._id.toString() }); }
  }
  return { processed: results.length, results };
}

export async function buyerOfferLists(userId: string) {
  await connectDatabase();
  const sellerIds = await activeBuyerSellerIds(userId);
  if (!sellerIds.length) return { lists: [] };
  const now = new Date();
  await OfferList.updateMany({ sellerId: { $in: sellerIds }, buyerUserId: userId, status: "active", availableUntil: { $lte: now } }, { $set: { status: "expired" } });
  const rows = await OfferList.find({ sellerId: { $in: sellerIds }, buyerUserId: userId }).sort({ createdAt: -1, _id: -1 }).limit(100).lean();
  return { lists: rows.map(outputList) };
}

export async function buyerOfferList(userId: string, listId: string) {
  if (!mongoose.isValidObjectId(listId)) throw new AutomationError("INVALID");
  await connectDatabase();
  const sellerIds = await activeBuyerSellerIds(userId);
  if (!sellerIds.length) throw new AutomationError("NOT_FOUND");
  const row = await OfferList.findOne({ _id: listId, sellerId: { $in: sellerIds }, buyerUserId: userId }).lean();
  if (!row) throw new AutomationError("NOT_FOUND");
  return outputList(row);
}

export async function automationSummary() {
  await connectDatabase();
  const [automations, runs, lists] = await Promise.all([
    withTenantBypass("operator-automation-summary", () =>
      OfferAutomation.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    ),
    withTenantBypass("operator-automation-run-summary", () =>
      OfferAutomationRun.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    ),
    withTenantBypass("operator-active-offer-list-summary", () =>
      OfferList.countDocuments({ status: "active", availableUntil: { $gt: new Date() } }),
    ),
  ]);
  return { automations: Object.fromEntries(automations.map((row: { _id: string; count: number }) => [row._id, row.count])), runs: Object.fromEntries(runs.map((row: { _id: string; count: number }) => [row._id, row.count])), activeLists: lists };
}
