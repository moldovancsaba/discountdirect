export const RECOMMENDATION_RULE_VERSION = "recommendations-2026-09-v1";

export type RecommendationProduct = { id: string; version: number; sku: string; name: string; priceHuf: number; stock: number; active: boolean; category: string; compatibleWith: string[] };
export type RecommendationPurchase = { id: string; productSku: string; purchasedAt: Date; status: string };

export function rankRecommendations(products: RecommendationProduct[], purchases: RecommendationPurchase[], now = new Date()) {
  const evidence = purchases.filter((purchase) => purchase.status === "purchased");
  if (!evidence.length) return [];
  const purchasedSkus = new Set(evidence.map((purchase) => purchase.productSku.toUpperCase()));
  const productBySku = new Map(products.map((product) => [product.sku.toUpperCase(), product]));
  const purchasedCategories = new Set(evidence.map((purchase) => productBySku.get(purchase.productSku.toUpperCase())?.category).filter(Boolean));
  const candidates = products.filter((product) => product.active && product.stock > 0).flatMap((product) => {
    const normalizedSku = product.sku.toUpperCase();
    const compatibleEvidence = evidence.filter((purchase) => product.compatibleWith.map((sku) => sku.toUpperCase()).includes(purchase.productSku.toUpperCase()));
    if (compatibleEvidence.length) return [{ product, score: 300, reasonCode: "COMPATIBLE_ACCESSORY", reasonText: `${compatibleEvidence[0].productSku} korábbi vásárlásával kompatibilis.`, evidenceIds: compatibleEvidence.map((item) => item.id).sort() }];
    const sameProduct = evidence.filter((purchase) => purchase.productSku.toUpperCase() === normalizedSku).sort((a, b) => b.purchasedAt.getTime() - a.purchasedAt.getTime());
    if (sameProduct.length && now.getTime() - sameProduct[0].purchasedAt.getTime() >= 90 * 24 * 60 * 60 * 1000) return [{ product, score: 200, reasonCode: "REPLENISHMENT", reasonText: `A legutóbbi ${product.sku} vásárlás legalább 90 napos.`, evidenceIds: sameProduct.map((item) => item.id).sort() }];
    if (!purchasedSkus.has(normalizedSku) && purchasedCategories.has(product.category)) {
      const categoryEvidence = evidence.filter((purchase) => productBySku.get(purchase.productSku.toUpperCase())?.category === product.category);
      return [{ product, score: 100, reasonCode: "SAME_CATEGORY", reasonText: `Korábbi vásárlás ugyanebből a kategóriából: ${product.category}.`, evidenceIds: categoryEvidence.map((item) => item.id).sort() }];
    }
    return [];
  });
  return candidates.sort((a, b) => b.score - a.score || a.product.id.localeCompare(b.product.id)).slice(0, 20);
}
