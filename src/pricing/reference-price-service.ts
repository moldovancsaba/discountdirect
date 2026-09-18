import "server-only";
import { Product, ProductRevision } from "@/catalog/models";
import { calculateReferencePrice, type PriceObservation } from "./reference-price";

type RevisionRow = { snapshot?: { priceHuf?: unknown }; version: unknown; createdAt: Date | string };

export async function productReferencePrice(sellerId: unknown, productId: unknown, calculatedAt = new Date()) {
  const current = await Product.findOne({ _id: productId, sellerId, active: true }).lean();
  if (!current) throw new Error("REFERENCE_PRICE_PRODUCT_NOT_FOUND");
  const windowStart = new Date(calculatedAt.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [beforeWindow, withinWindow] = await Promise.all([
    ProductRevision.findOne({ sellerId, productId, createdAt: { $lte: windowStart } }).sort({ createdAt: -1, version: -1 }).lean(),
    ProductRevision.find({ sellerId, productId, createdAt: { $gt: windowStart, $lte: calculatedAt } }).sort({ createdAt: 1, version: 1 }).lean(),
  ]);
  const revisions = [beforeWindow, ...withinWindow]
    .filter(Boolean)
    .map((value) => {
      const row = value as unknown as RevisionRow;
      return { priceHuf: Number(row.snapshot?.priceHuf), version: Number(row.version), observedAt: new Date(row.createdAt) } satisfies PriceObservation;
    });
  return {
    product: current,
    evidence: calculateReferencePrice({ priceHuf: current.priceHuf, version: current.version, observedAt: new Date(current.updatedAt ?? calculatedAt) }, revisions, calculatedAt),
  };
}
