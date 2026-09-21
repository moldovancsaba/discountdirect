import { createHash } from "node:crypto";

export const NEWSLETTER_TEMPLATE_VERSION = 1;
export type NewsletterItem = { productId: string; productVersion: number; productSku: string; productName: string; priceHuf: number; reasonCode: string; reasonText: string; evidencePurchaseIds: string[] };

export function newsletterContentHash(input: { sellerId: string; buyerUserId: string; runId: string; items: readonly NewsletterItem[]; availableUntil: Date | string; templateVersion?: number }) {
  const canonical = {
    sellerId: input.sellerId, buyerUserId: input.buyerUserId, runId: input.runId,
    availableUntil: new Date(input.availableUntil).toISOString(), templateVersion: input.templateVersion ?? NEWSLETTER_TEMPLATE_VERSION,
    items: input.items.map((item) => ({ ...item })),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function newsletterItems(input: unknown): NewsletterItem[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 10) throw new Error("INVALID_NEWSLETTER_ITEMS");
  return input.map((candidate) => {
    if (!candidate || typeof candidate !== "object") throw new Error("INVALID_NEWSLETTER_ITEM");
    const item = candidate as Record<string, unknown>;
    if (typeof item.productId !== "string" || !item.productId || !Number.isInteger(item.productVersion) || Number(item.productVersion) < 1 || typeof item.productSku !== "string" || typeof item.productName !== "string" || !Number.isInteger(item.priceHuf) || Number(item.priceHuf) < 0 || typeof item.reasonCode !== "string" || typeof item.reasonText !== "string" || !Array.isArray(item.evidencePurchaseIds) || item.evidencePurchaseIds.some((id) => typeof id !== "string")) throw new Error("INVALID_NEWSLETTER_ITEM");
    return { productId: item.productId, productVersion: Number(item.productVersion), productSku: item.productSku, productName: item.productName, priceHuf: Number(item.priceHuf), reasonCode: item.reasonCode, reasonText: item.reasonText, evidencePurchaseIds: item.evidencePurchaseIds as string[] };
  });
}
