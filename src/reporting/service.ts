import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- Reporting normalizes heterogeneous source documents at this boundary. */
import { randomUUID } from "node:crypto";
import { Membership, Seller } from "@/auth/models";
import { Offer } from "@/offers/models";
import { Campaign } from "@/campaigns/models";
import { DeliveryOutbox } from "@/delivery/models";
import { OfferAutomationRun } from "@/automations/models";
import { Purchase } from "@/purchases/models";
import { connectDatabase } from "@/lib/database";
import { withTenantBypass } from "@/lib/tenant-core";
import { campaignLift } from "@/campaigns/holdout";
import { emptyCounters, projectionIsFresh, REPORTING_SCHEMA_VERSION, reduceMetricFacts, utcDay, type MetricFact } from "./core";
import { MetricProjectionCheckpoint, MetricRollup } from "./models";
import { ProductCostRevision } from "./cost-models";
import { attributeOrder } from "./attribution";

const LOOKBACK_DAYS = 90;
const SOURCE_LIMIT = 20_000;
const dayKey = (value: Date | string) => utcDay(value).toISOString();

function add(map: Map<string, MetricFact[]>, date: Date | string, ...facts: MetricFact[]) {
  const key = dayKey(date); map.set(key, [...(map.get(key) ?? []), ...facts]);
}

async function sourceRows(model: any, sellerId: any, from: Date, dateField = "createdAt") {
  return model.find({ sellerId, [dateField]: { $gte: from } }).sort({ [dateField]: 1, _id: 1 }).limit(SOURCE_LIMIT).lean();
}

export async function rebuildSellerMetrics(sellerId: string, now = new Date()) {
  await connectDatabase();
  return withTenantBypass("reporting projection rebuild", async () => {
    const seller = await Seller.findOne({ _id: sellerId, status: "active" }).select({ _id: 1 }).lean();
    if (!seller) throw new Error("SELLER_NOT_FOUND");
    const generationId = randomUUID(); const startedAt = new Date();
    await MetricProjectionCheckpoint.findOneAndUpdate({ sellerId }, { $set: { status: "running", startedAt, lastErrorCode: null, schemaVersion: REPORTING_SCHEMA_VERSION }, $setOnInsert: { activeGenerationId: null } }, { upsert: true });
    try {
      const from = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);
      const [offers, campaigns, deliveries, runs, purchases, allCampaigns] = await Promise.all([
        sourceRows(Offer, sellerId, from), sourceRows(Campaign, sellerId, from), sourceRows(DeliveryOutbox, sellerId, from),
        sourceRows(OfferAutomationRun, sellerId, from, "startedAt"), sourceRows(Purchase, sellerId, from, "purchasedAt"),
        Campaign.find({ sellerId }).sort({ createdAt: -1 }).limit(500).lean(),
      ]);
      const days = new Map<string, MetricFact[]>();
      for (const row of offers) add(days, row.createdAt, { kind: "offers" }, ...(row.status === "accepted" ? [{ kind: "acceptedOffers" } as MetricFact] : row.status === "declined" ? [{ kind: "declinedOffers" } as MetricFact] : []));
      for (const row of campaigns) add(days, row.createdAt, { kind: "campaigns" });
      for (const row of deliveries) add(days, row.createdAt, { kind: "deliveries" }, ...(row.status === "sent" ? [{ kind: "sentDeliveries" } as MetricFact] : ["retryable_failed", "bounced", "complained"].includes(row.status) ? [{ kind: "failedDeliveries" } as MetricFact] : row.status === "suppressed" ? [{ kind: "suppressedDeliveries" } as MetricFact] : []));
      for (const row of runs) add(days, row.startedAt, { kind: "automationRuns" }, ...(row.status === "failed" ? [{ kind: "failedAutomationRuns" } as MetricFact] : []));
      for (const row of purchases) add(days, row.purchasedAt, ...(row.status === "purchased" ? [{ kind: "purchases" } as MetricFact, { kind: "revenueHuf", value: row.totalHuf } as MetricFact] : row.status === "refunded" ? [{ kind: "refunds" } as MetricFact] : []));
      const computedAt = new Date();
      const rollups: any[] = [...days.entries()].map(([day, facts]) => ({ sellerId, generationId, scope: "seller_day", scopeId: "seller", day: new Date(day), schemaVersion: REPORTING_SCHEMA_VERSION, counters: reduceMetricFacts(facts), computedAt }));
      for (const campaign of allCampaigns) {
        const treatment = new Set((campaign.audienceSnapshot ?? []).map((item: any) => item.customerId.toString()));
        const holdout = new Set((campaign.holdoutSnapshot ?? []).map((item: any) => item.customerId.toString()));
        const ids = [...treatment, ...holdout];
        const matching = ids.length ? await Purchase.find({ sellerId, customerId: { $in: ids }, status: "purchased", purchasedAt: { $gte: campaign.createdAt, $lte: campaign.expiresAt }, $or: [{ productId: campaign.productId }, { productSku: campaign.productSku }] }).select({ customerId: 1 }).lean() : [];
        const converted = new Set(matching.map((row: any) => row.customerId.toString()));
        const counters = campaignLift({ treatmentSize: treatment.size, treatmentConversions: [...treatment].filter((id) => converted.has(id)).length, holdoutSize: holdout.size, holdoutConversions: [...holdout].filter((id) => converted.has(id)).length });
        rollups.push({ sellerId, generationId, scope: "campaign", scopeId: campaign._id.toString(), day: utcDay(campaign.createdAt), schemaVersion: REPORTING_SCHEMA_VERSION, counters, computedAt });
      }
      if (rollups.length) await MetricRollup.insertMany(rollups);
      await MetricProjectionCheckpoint.updateOne({ sellerId }, { $set: { activeGenerationId: generationId, status: "ready", completedAt: computedAt, lastErrorCode: null } });
      await MetricRollup.deleteMany({ sellerId, generationId: { $ne: generationId }, createdAt: { $lt: startedAt } });
      return { sellerId: String(sellerId), generationId, rollupCount: rollups.length, computedAt };
    } catch (error) {
      await MetricRollup.deleteMany({ sellerId, generationId });
      await MetricProjectionCheckpoint.updateOne({ sellerId }, { $set: { status: "failed", completedAt: new Date(), lastErrorCode: error instanceof Error ? error.message.slice(0, 120) : "PROJECTION_FAILED" } });
      throw error;
    }
  });
}

export async function rebuildDueMetrics(limit = 10) {
  await connectDatabase();
  const sellers = await withTenantBypass("reporting cron seller scan", async () => await Seller.find({ status: "active" }).sort({ _id: 1 }).limit(Math.max(1, Math.min(limit, 50))).select({ _id: 1 }).lean());
  const results = [];
  for (const seller of sellers) { try { results.push({ ok: true, ...(await rebuildSellerMetrics(seller._id.toString())) }); } catch (error) { results.push({ ok: false, sellerId: seller._id.toString(), error: error instanceof Error ? error.message : "PROJECTION_FAILED" }); } }
  return { processed: results.length, results };
}

async function sellerForUser(userId: string, sellerSlug: string) {
  await connectDatabase(); const seller = await Seller.findOne({ slug: sellerSlug, status: "active" }).lean();
  if (!seller || !await Membership.exists({ sellerId: seller._id, userId, status: "active" })) throw new Error("FORBIDDEN"); return seller;
}

export async function sellerMetrics(userId: string, sellerSlug: string, range: { from?: Date; to?: Date } = {}) {
  const seller = await sellerForUser(userId, sellerSlug);
  const checkpoint = await MetricProjectionCheckpoint.findOne({ sellerId: seller._id }).lean();
  if (!checkpoint?.activeGenerationId || checkpoint.status !== "ready" || !checkpoint.completedAt) return { seller, ready: false as const, reason: "NOT_BUILT" };
  const to = range.to && !Number.isNaN(range.to.getTime()) ? range.to : new Date();
  const from = range.from && !Number.isNaN(range.from.getTime()) ? range.from : new Date(to.getTime() - 90 * 86_400_000);
  const boundedFrom = new Date(Math.max(from.getTime(), to.getTime() - 90 * 86_400_000));
  const rows = await MetricRollup.find({ sellerId: seller._id, generationId: checkpoint.activeGenerationId, scope: "seller_day", day: { $gte: utcDay(boundedFrom), $lte: utcDay(to) } }).sort({ day: -1 }).limit(90).lean();
  const totals = rows.reduce((sum: any, row: any) => { for (const [key, value] of Object.entries(row.counters ?? {})) sum[key] = (sum[key] ?? 0) + Number(value); return sum; }, emptyCounters());
  return { seller, ready: true as const, stale: !projectionIsFresh(checkpoint.completedAt), computedAt: checkpoint.completedAt, from: boundedFrom, to, definitionVersion: REPORTING_SCHEMA_VERSION, totals, days: rows.map((row: any) => ({ day: row.day, counters: row.counters })) };
}

export async function campaignMetrics(sellerId: string, campaignIds: string[]) {
  await connectDatabase(); const checkpoint = await MetricProjectionCheckpoint.findOne({ sellerId }).lean();
  if (!checkpoint?.activeGenerationId || checkpoint.status !== "ready") return new Map<string, any>();
  const rows = await MetricRollup.find({ sellerId, generationId: checkpoint.activeGenerationId, scope: "campaign", scopeId: { $in: campaignIds } }).lean();
  return new Map(rows.map((row: any) => [row.scopeId, row.counters]));
}

export async function campaignAttribution(sellerId: string, campaign: { _id: unknown; productId: unknown; createdAt: Date; expiresAt: Date }) {
  await connectDatabase();
  const purchases = await Purchase.find({ sellerId, productId: campaign.productId, status: { $in: ["purchased", "refunded"] }, purchasedAt: { $gte: campaign.createdAt, $lte: campaign.expiresAt } }).select({ orderId: 1, purchasedAt: 1, totalHuf: 1, status: 1 }).limit(SOURCE_LIMIT).lean();
  const costs = await ProductCostRevision.find({ sellerId, productId: campaign.productId, effectiveAt: { $lte: campaign.expiresAt } }).sort({ effectiveAt: -1, version: -1 }).limit(100).lean();
  let attributedRevenueHuf = 0; let marginHuf = 0; let marginEvidenceCount = 0; let missingCostCount = 0; let refundCount = 0;
  for (const purchase of purchases) {
    if (purchase.status === "refunded") { refundCount += 1; continue; }
    const cost = costs.find((revision) => revision.effectiveAt <= purchase.purchasedAt) ?? null;
    const result = attributeOrder({ orderId: purchase.orderId, orderAt: purchase.purchasedAt, revenueHuf: purchase.totalHuf, campaignOfferId: String(campaign._id), campaignCreatedAt: campaign.createdAt, campaignExpiresAt: campaign.expiresAt }, cost ? { unitCostHuf: cost.unitCostHuf, effectiveAt: cost.effectiveAt, version: cost.version } : null);
    attributedRevenueHuf += result.netRevenueHuf;
    if (result.marginHuf === null) missingCostCount += 1; else { marginEvidenceCount += 1; marginHuf += result.marginHuf; }
  }
  return { ruleVersion: "attribution-2026-09-25-v1", purchaseCount: purchases.length, attributedRevenueHuf, marginHuf: marginEvidenceCount ? marginHuf : null, marginEvidenceCount, missingCostCount, refundCount };
}

export async function projectionHealth() {
  await connectDatabase(); return withTenantBypass("operator reporting health", async () => {
    const rows = await MetricProjectionCheckpoint.find({}).sort({ updatedAt: -1 }).limit(100).lean();
    return { total: rows.length, ready: rows.filter((r: any) => r.status === "ready").length, failed: rows.filter((r: any) => r.status === "failed").length, stale: rows.filter((r: any) => !r.completedAt || !projectionIsFresh(r.completedAt)).length, lastCompletedAt: rows.find((r: any) => r.completedAt)?.completedAt ?? null };
  });
}
