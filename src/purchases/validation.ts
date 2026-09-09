import { normalizeEmail } from "../auth/crypto.ts";

export type PurchaseInput = {
  externalBuyerId: string;
  buyerEmail: string | null;
  buyerName: string;
  orderId: string;
  lineId: string;
  productSku: string;
  productName: string;
  purchasedAt: Date;
  quantity: number;
  totalHuf: number;
};

function requiredText(value: unknown, max: number, code: string) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new Error(code);
  return value.trim();
}

export function validatePurchaseInput(value: unknown): PurchaseInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("record");
  const row = value as Record<string, unknown>;
  const purchasedAt = new Date(String(row.purchasedAt ?? ""));
  if (Number.isNaN(purchasedAt.getTime()) || purchasedAt.getTime() > Date.now() + 300_000) throw new Error("purchasedAt");
  if (!Number.isInteger(row.quantity) || Number(row.quantity) < 1 || Number(row.quantity) > 100_000) throw new Error("quantity");
  if (!Number.isInteger(row.totalHuf) || Number(row.totalHuf) < 0 || Number(row.totalHuf) > 1_000_000_000) throw new Error("totalHuf");
  let buyerEmail: string | null = null;
  if (row.buyerEmail !== undefined && row.buyerEmail !== null && row.buyerEmail !== "") buyerEmail = normalizeEmail(String(row.buyerEmail));
  return {
    externalBuyerId: requiredText(row.externalBuyerId, 100, "externalBuyerId"),
    buyerEmail,
    buyerName: requiredText(row.buyerName, 120, "buyerName"),
    orderId: requiredText(row.orderId, 100, "orderId"),
    lineId: requiredText(row.lineId, 100, "lineId"),
    productSku: requiredText(row.productSku, 64, "productSku"),
    productName: requiredText(row.productName, 160, "productName"),
    purchasedAt,
    quantity: Number(row.quantity),
    totalHuf: Number(row.totalHuf),
  };
}
