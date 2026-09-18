import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { BuyerRelationship, Membership, Seller, User } from "../src/auth/models.ts";
import { Product } from "../src/catalog/models.ts";
import { prototypeFixture } from "../src/fixtures/prototype.ts";
import { Conversation, ConversationEvent } from "../src/messaging/models.ts";
import { Offer, OfferEvent } from "../src/offers/models.ts";
import { ChannelPreference } from "../src/privacy/models.ts";
import { Customer, Purchase, PurchaseImportBatch } from "../src/purchases/models.ts";
import { RecommendationPreview } from "../src/recommendations/models.ts";
import { Market, SellerSettingsModel } from "../src/settings/models.ts";
import { SELLER_SETTINGS_DEFAULTS } from "../src/settings/validation.ts";
import { deriveCustomerSegment, SEGMENT_RULE_VERSION } from "../src/relationships/segments.ts";

function option(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

const target = option("target");
if (target !== "development" && target !== "staging") throw new Error("Required: --target=development|staging. Production fixture loading is refused.");
if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") throw new Error("Prototype fixtures cannot be loaded into production.");
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is required");
const ownerEmail = option("owner-email")?.trim().toLowerCase() ?? "elektrohome.owner@example.test";
const fixture = prototypeFixture;

await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || "discountdirect", serverSelectionTimeoutMS: 5000, autoIndex: false });
try {
  const seller = await Seller.findOneAndUpdate(
    { slug: fixture.seller.slug },
    { $setOnInsert: { name: fixture.seller.name, status: "active" } },
    { upsert: true, returnDocument: "after" },
  );
  if (seller.name !== fixture.seller.name) throw new Error(`Seller slug ${fixture.seller.slug} already belongs to another seller.`);

  const owner = await User.findOneAndUpdate(
    { emailNormalized: ownerEmail },
    { $setOnInsert: { displayName: "ElektroHome Fixture Owner", status: "pending", systemRole: null } },
    { upsert: true, returnDocument: "after" },
  );
  await Membership.updateOne({ sellerId: seller._id, userId: owner._id }, { $set: { role: "owner", status: "active" } }, { upsert: true });
  await Market.updateOne(
    { code: "HU" },
    { $setOnInsert: { code: "HU", legalBasisByChannel: { chat: "legitimate_interest", email: "legitimate_interest", mailing: "legitimate_interest", rcs: "consent" }, retentionDays: 2555, softOptIn: true, currency: "HUF", locale: "hu-HU", referencePriceDays: 30 } },
    { upsert: true },
  );
  await SellerSettingsModel.updateOne(
    { sellerId: seller._id },
    { $setOnInsert: { sellerId: seller._id, marketCode: "HU", settings: SELLER_SETTINGS_DEFAULTS, version: 1, updatedByUserId: owner._id } },
    { upsert: true },
  );

  const products = new Map<string, { _id: mongoose.Types.ObjectId; sku: string; name: string; priceHuf: number; version: number }>();
  for (const [sku, name, priceHuf, buyerKey, compatibleWith] of fixture.catalog) {
    const product = await Product.findOneAndUpdate(
      { sellerId: seller._id, skuNormalized: sku },
      { $set: { sku, name, priceHuf, stock: 100, category: buyerKey, compatibleWith, active: true, updatedByUserId: owner._id }, $setOnInsert: { version: 1 } },
      { upsert: true, returnDocument: "after", runValidators: true },
    );
    products.set(sku, product as unknown as { _id: mongoose.Types.ObjectId; sku: string; name: string; priceHuf: number; version: number });
  }

  const batchChecksum = createHash("sha256").update(`${fixture.seller.slug}:prototype-v1`).digest("hex");
  const importBatch = await PurchaseImportBatch.findOneAndUpdate(
    { sellerId: seller._id, checksum: batchChecksum },
    { $setOnInsert: { createdByUserId: owner._id, schemaVersion: "1", sourceName: "DiscountDirect prototype", status: "applied", rows: [], appliedAt: new Date() } },
    { upsert: true, returnDocument: "after" },
  );

  const summary = [];
  for (const [buyerIndex, buyerFixture] of fixture.buyers.entries()) {
    const buyer = await User.findOneAndUpdate(
      { emailNormalized: buyerFixture.email },
      { $set: { displayName: buyerFixture.name, status: "active" }, $setOnInsert: { systemRole: null } },
      { upsert: true, returnDocument: "after" },
    );
    await BuyerRelationship.updateOne({ sellerId: seller._id, buyerUserId: buyer._id }, { $set: { status: "active" } }, { upsert: true });
    const customer = await Customer.findOneAndUpdate(
      { sellerId: seller._id, externalBuyerId: `prototype-${buyerFixture.key}` },
      { $set: { emailNormalized: buyerFixture.email, displayName: buyerFixture.name, privacyStatus: "active", sourceName: "DiscountDirect prototype" } },
      { upsert: true, returnDocument: "after" },
    );
    await ChannelPreference.findOneAndUpdate(
      { sellerId: seller._id, buyerUserId: buyer._id, channel: "email", purpose: "marketing" },
      { $set: { customerId: customer._id, status: "subscribed", noticeVersion: "prototype-v1", changedAt: new Date("2026-09-01T08:00:00Z") } },
      { upsert: true, returnDocument: "after" },
    );

    const purchaseIds: mongoose.Types.ObjectId[] = [];
    for (const [index, [sku, name, date, totalHuf]] of buyerFixture.history.entries()) {
      const purchase = await Purchase.findOneAndUpdate(
        { sellerId: seller._id, orderId: `prototype-${buyerFixture.key}-${index + 1}`, lineId: "1" },
        { $set: { customerId: customer._id, productId: products.get(sku)?._id ?? null, productSku: sku, productNameSnapshot: name, purchasedAt: new Date(`${date}T10:00:00Z`), quantity: 1, totalHuf, status: "purchased", sourceName: "DiscountDirect prototype", sourceChecksum: createHash("sha256").update(`${buyerFixture.key}:${index}`).digest("hex"), importBatchId: importBatch._id, correctionReason: null, correctedAt: null, correctedByUserId: null }, $setOnInsert: { version: 1 } },
        { upsert: true, returnDocument: "after", runValidators: true },
      );
      purchaseIds.push(purchase._id);
    }
    const activePurchases = await Purchase.find({ sellerId: seller._id, customerId: customer._id, status: "purchased" }).select({ purchasedAt: 1, totalHuf: 1 }).lean();
    const firstOrderAt = activePurchases.reduce<Date | null>((earliest, row) => !earliest || row.purchasedAt < earliest ? row.purchasedAt : earliest, null);
    const lastOrderAt = activePurchases.reduce<Date | null>((latest, row) => !latest || row.purchasedAt > latest ? row.purchasedAt : latest, null);
    await BuyerRelationship.updateOne(
      { sellerId: seller._id, buyerUserId: buyer._id },
      { $set: { segment: deriveCustomerSegment(activePurchases.length, firstOrderAt, lastOrderAt), segmentRuleVersion: SEGMENT_RULE_VERSION, orderCount: activePurchases.length, totalHuf: activePurchases.reduce((sum, row) => sum + row.totalHuf, 0), firstOrderAt, lastOrderAt } },
    );

    const recommendationRows = buyerFixture.recommendations.map(([sku, reasonText], index) => {
      const product = products.get(sku);
      if (!product) throw new Error(`Missing fixture product ${sku}`);
      return { productId: product._id, productVersion: product.version, productSku: product.sku, productName: product.name, priceHuf: product.priceHuf, score: 300 - index, reasonCode: index ? "UPGRADE" : "REPLENISH", reasonText, evidencePurchaseIds: purchaseIds.slice(0, 1) };
    });
    const preview = await RecommendationPreview.findOneAndUpdate(
      { sellerId: seller._id, customerId: customer._id, channel: "email", ruleVersion: "prototype-v1", inputHash: `prototype-${buyerFixture.key}-v1` },
      { $set: { buyerUserId: buyer._id, status: "eligible", exclusionReasons: [], recommendations: recommendationRows, createdByUserId: owner._id } },
      { upsert: true, returnDocument: "after", runValidators: true },
    );

    const baseTime = new Date(Date.UTC(2026, 8, 1 + buyerIndex, 8));
    const conversation = await Conversation.findOneAndUpdate(
      { sellerId: seller._id, buyerUserId: buyer._id },
      { $set: { customerId: customer._id, lastEventAt: new Date(baseTime.getTime() + buyerFixture.messages.length * 60_000), lastEventPreview: buyerFixture.messages.at(-1)?.[1] ?? "Beszélgetés megnyitva", sellerUnreadCount: 0, buyerUnreadCount: 0, pendingOfferCount: buyerFixture.pendingOffers }, $setOnInsert: { version: 1 } },
      { upsert: true, returnDocument: "after", runValidators: true },
    );
    for (const [index, [senderRole, body]] of buyerFixture.messages.entries()) {
      await ConversationEvent.findOneAndUpdate(
        { sellerId: seller._id, conversationId: conversation._id, senderUserId: senderRole === "buyer" ? buyer._id : owner._id, clientRequestId: `prototype-${buyerFixture.key}-message-${index + 1}` },
        { $setOnInsert: { kind: "message", senderRole, body, createdAt: new Date(baseTime.getTime() + index * 60_000) } },
        { upsert: true, returnDocument: "after" },
      );
    }

    if (buyerFixture.key === "gabor" || buyerFixture.key === "anna") {
      const sku = buyerFixture.key === "gabor" ? "MILKPRO" : "HEPA-2";
      const product = products.get(sku);
      if (!product) throw new Error(`Missing fixture offer product ${sku}`);
      const status = buyerFixture.key === "gabor" ? "pending" : "accepted";
      const discountPct = buyerFixture.key === "gabor" ? 18 : 15;
      const offer = await Offer.findOneAndUpdate(
        { sellerId: seller._id, createdByUserId: owner._id, clientRequestId: `prototype-${buyerFixture.key}-offer` },
        { $set: { buyerUserId: buyer._id, customerId: customer._id, conversationId: conversation._id, recommendationPreviewId: preview._id, channel: "email", productId: product._id, productSku: product.sku, productName: product.name, productVersion: product.version, reasonCode: "PROTOTYPE", reasonText: buyerFixture.key === "gabor" ? "A BaristaOne mellé ez a leggyakrabban vásárolt kiegészítő." : "Vásárlási előzményei alapján", evidencePurchaseIds: purchaseIds.slice(0, 1), originalHuf: product.priceHuf, discountPct, priceHuf: Math.round(product.priceHuf * (1 - discountPct / 100)), status, expiresAt: new Date("2027-09-01T00:00:00Z"), decidedAt: status === "accepted" ? new Date("2026-09-01T10:12:00Z") : null, decisionByUserId: status === "accepted" ? buyer._id : null }, $setOnInsert: { version: 1 } },
        { upsert: true, returnDocument: "after", runValidators: true },
      );
      await ConversationEvent.findOneAndUpdate(
        { sellerId: seller._id, conversationId: conversation._id, senderUserId: owner._id, clientRequestId: `prototype-${buyerFixture.key}-offer-event` },
        { $set: { kind: "offer", senderRole: "seller", offerId: offer._id, offerEventType: status === "pending" ? "created" : "accepted", createdAt: new Date(baseTime.getTime() + 30_000) } },
        { upsert: true, returnDocument: "after" },
      );
      if (!await OfferEvent.exists({ sellerId: seller._id, offerId: offer._id, type: status === "pending" ? "created" : "accepted" })) {
        await OfferEvent.create({ offerId: offer._id, sellerId: seller._id, type: status === "pending" ? "created" : "accepted", version: offer.version, occurredAt: baseTime, actorUserId: status === "accepted" ? buyer._id : owner._id });
      }
    }
    summary.push({ buyer: buyerFixture.name, orders: purchaseIds.length, pendingOffers: conversation.pendingOfferCount });
  }
  console.log(JSON.stringify({ target, seller: { name: seller.name, slug: seller.slug }, ownerEmail, buyers: summary }, null, 2));
} finally {
  await mongoose.disconnect();
}
