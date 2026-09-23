import { createHash, timingSafeEqual } from "node:crypto";
import { normalizedSyncItem } from "./sync-core.ts";

export class ShoprenterWebhookError extends Error {
  code: "CONFIGURATION" | "UNAUTHORIZED" | "INVALID" | "SHOP_MISMATCH";
  constructor(code: ShoprenterWebhookError["code"]) { super(code); this.code = code; }
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyShoprenterCallback(raw: string, suppliedSecret: string | null, expectedShop: string, configuredSecret = process.env.SHOPRENTER_WEBHOOK_SECRET) {
  if (!configuredSecret || configuredSecret.length < 32) throw new ShoprenterWebhookError("CONFIGURATION");
  if (!suppliedSecret || !safeEqual(suppliedSecret, configuredSecret)) throw new ShoprenterWebhookError("UNAUTHORIZED");
  if (!raw || raw.length > 64_000) throw new ShoprenterWebhookError("INVALID");
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw) as Record<string, unknown>; } catch { throw new ShoprenterWebhookError("INVALID"); }
  const event = body.event === "order_status_change" ? "order_status_change" : "order_confirm";
  const envelope = body.orders as Record<string, unknown> | undefined;
  const values = envelope?.order;
  const order = (Array.isArray(values) ? values[0] : values) as Record<string, unknown> | undefined;
  if (!order || typeof order !== "object") throw new ShoprenterWebhookError("INVALID");
  if (String(order.storeName ?? "") !== expectedShop) throw new ShoprenterWebhookError("SHOP_MISMATCH");
  const providerId = String(order.innerResourceId ?? order.innerId ?? "").trim();
  const createdAt = new Date(String(order.dateCreated ?? order.dateAdded ?? order.orderDate ?? ""));
  const currency = String(order.currency ?? "HUF").toUpperCase();
  if (!providerId || Number.isNaN(createdAt.getTime()) || currency !== "HUF") throw new ShoprenterWebhookError("INVALID");
  const canonical = normalizedSyncItem("order_sync", { providerId, status: String(order.statusText ?? order.orderStatus ?? "unknown"), totalHuf: Number(order.totalGross ?? order.total ?? 0), createdAt, updatedAt: null });
  return { event, providerId, canonical, payloadHash: createHash("sha256").update(raw).digest("hex") };
}
