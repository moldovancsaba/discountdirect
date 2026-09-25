import "server-only";
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { sellerAccess } from "@/catalog/service";
import { ChannelPreference } from "@/privacy/models";
import { Offer } from "@/offers/models";
import { RedemptionCoupon } from "@/redemptions/models";
import { persistArtifact } from "@/artifacts/service";
import { PostalAddress, PostalFulfillment, PrintSnapshot } from "./models";
import { PRINT_TEMPLATE_VERSION, renderOfferLetterPdf } from "./pdf-core";
import { withSellerTenant } from "@/lib/tenant";

export class PrintError extends Error {
  constructor(
    public code:
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "INVALID"
      | "CONFLICT"
      | "UNAVAILABLE",
  ) {
    super(code);
  }
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

async function ensureFulfillment(
  snapshot: { _id: unknown; artifactId?: unknown },
  sellerId: unknown,
) {
  if (!snapshot.artifactId) throw new PrintError("UNAVAILABLE");
  await withSellerTenant(
    sellerId as string,
    async () =>
      await PostalFulfillment.updateOne(
        { sellerId, printSnapshotId: snapshot._id },
        {
          $setOnInsert: {
            artifactId: snapshot.artifactId,
            status: "ready",
            version: 1,
          },
        },
        { upsert: true },
      ),
  );
}

export async function generateOfferLetter(
  userId: string,
  sellerSlug: string,
  offerId: string,
) {
  if (!mongoose.isValidObjectId(offerId)) throw new PrintError("INVALID");
  const access = await sellerAccess(userId, sellerSlug).catch(() => {
    throw new PrintError("FORBIDDEN");
  });
  const now = new Date();
  const offer = await withSellerTenant(
    access.seller._id,
    async () =>
      await Offer.findOne({
        _id: offerId,
        sellerId: access.seller._id,
        channel: "postal",
        status: "accepted",
        expiresAt: { $gt: now },
      }).lean(),
  );
  if (!offer) throw new PrintError("NOT_FOUND");
  const [address, preference, coupon] = await Promise.all([
    PostalAddress.findOne({ buyerUserId: offer.buyerUserId }).lean(),
    withSellerTenant(
      access.seller._id,
      async () =>
        await ChannelPreference.findOne({
          sellerId: offer.sellerId,
          buyerUserId: offer.buyerUserId,
          channel: "postal",
          purpose: "marketing",
          status: "subscribed",
        }).lean(),
    ),
    withSellerTenant(
      access.seller._id,
      async () =>
        await RedemptionCoupon.findOne({
          sellerId: offer.sellerId,
          offerId: offer._id,
          status: "issued",
          expiresAt: { $gt: now },
        }).lean(),
    ),
  ]);
  if (!address || !preference || !coupon) throw new PrintError("CONFLICT");
  const query = {
    sellerId: offer.sellerId,
    offerId: offer._id,
    offerVersion: offer.version,
    templateVersion: PRINT_TEMPLATE_VERSION,
  };
  const prior = await withSellerTenant(
    access.seller._id,
    async () => await PrintSnapshot.findOne(query).lean(),
  );
  if (prior?.status === "ready") {
    await ensureFulfillment(prior, offer.sellerId);
    return prior;
  }
  if (prior?.status === "generating") throw new PrintError("UNAVAILABLE");
  const id = prior ? prior._id : new mongoose.Types.ObjectId();
  const generationAttempt = (prior?.generationAttempt ?? 0) + 1;
  const canonical = [
    address.recipientName,
    address.countryCode,
    address.postalCode,
    address.city,
    address.line1,
    address.line2 ?? "",
  ].join("\n");
  const snapshotData = {
    sellerId: offer.sellerId,
    offerId: offer._id,
    offerVersion: offer.version,
    buyerUserId: offer.buyerUserId,
    couponId: coupon._id,
    locale: "hu-HU",
    addressHash: hash(canonical),
    referencePriceEvidence: {
      referencePriceHuf: offer.referencePriceHuf ?? offer.originalHuf,
      windowStart: offer.referencePriceWindowStart ?? null,
      calculatedAt: offer.referencePriceCalculatedAt ?? null,
      versions: offer.referencePriceEvidenceVersions ?? [],
    },
    templateVersion: PRINT_TEMPLATE_VERSION,
    generationAttempt,
    status: "generating",
    failureCode: null,
    generatedByUserId: userId,
    generatedAt: now,
  };
  if (prior) {
    const claimed = await withSellerTenant(
      access.seller._id,
      async () =>
        await PrintSnapshot.findOneAndUpdate(
          { ...query, status: "failed" },
          { $set: snapshotData },
          { new: true },
        ).lean(),
    );
    if (!claimed) throw new PrintError("UNAVAILABLE");
  } else
    await withSellerTenant(
      access.seller._id,
      async () => await PrintSnapshot.create({ _id: id, ...snapshotData }),
    );
  try {
    const pdf = await renderOfferLetterPdf({
      snapshotId: id.toString(),
      sellerName: access.seller.name,
      recipientName: address.recipientName,
      addressLines: [
        `${address.postalCode} ${address.city}`,
        address.line1,
        ...(address.line2 ? [address.line2] : []),
      ],
      productName: offer.productName,
      productSku: offer.productSku,
      originalHuf: offer.originalHuf,
      referencePriceHuf: offer.referencePriceHuf ?? offer.originalHuf,
      discountPct: offer.discountPct,
      priceHuf: offer.priceHuf,
      couponCode: coupon.code,
      validUntil: offer.expiresAt,
      generatedAt: now,
      legalText:
        "Az ajánlat a készlet erejéig, a feltüntetett lejáratig és a kupon feltételei szerint használható fel.",
    });
    const artifact = await persistArtifact({
      sellerId: offer.sellerId.toString(),
      kind: "letter-pdf",
      idempotencyKey: `print:${offer._id}:v${offer.version}:${PRINT_TEMPLATE_VERSION}:a${generationAttempt}`,
      filename: `ajanlat-${offer._id}.pdf`,
      mimeType: "application/pdf",
      body: pdf,
      createdByUserId: userId,
      now,
    });
    const ready = await withSellerTenant(
      access.seller._id,
      async () =>
        await PrintSnapshot.findOneAndUpdate(
          {
            _id: id,
            sellerId: offer.sellerId,
            status: "generating",
            generationAttempt,
          },
          { $set: { status: "ready", artifactId: artifact._id } },
          { new: true },
        ).lean(),
    );
    if (!ready) throw new PrintError("UNAVAILABLE");
    await ensureFulfillment(ready, offer.sellerId);
    return ready;
  } catch (error) {
    await withSellerTenant(
      access.seller._id,
      async () =>
        await PrintSnapshot.updateOne(
          {
            _id: id,
            sellerId: offer.sellerId,
            status: "generating",
            generationAttempt,
          },
          { $set: { status: "failed", failureCode: "GENERATION_FAILED" } },
        ),
    );
    throw error;
  }
}
