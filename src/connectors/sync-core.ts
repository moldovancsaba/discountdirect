import { createHash } from "node:crypto";
import type { CanonicalOrder, CanonicalProduct, CanonicalStock, ConnectorProvider } from "./contracts.ts";
import { reconcileProviderOrder, type ReconciliationDecision } from "./reconciliation.ts";

export const CONNECTOR_SYNC_KINDS = ["catalog_sync", "order_sync", "stock_sync"] as const;
export type ConnectorSyncKind = (typeof CONNECTOR_SYNC_KINDS)[number];
export type ConnectorSyncItem = CanonicalProduct | CanonicalOrder | CanonicalStock;

export function connectorSyncKind(value: unknown): ConnectorSyncKind | null {
  return typeof value === "string" && CONNECTOR_SYNC_KINDS.includes(value as ConnectorSyncKind) ? value as ConnectorSyncKind : null;
}

export function connectorRunKey(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9:_-]{8,160}$/.test(value) ? value : null;
}

export function retryAt(attempt: number, now = Date.now()) {
  if (!Number.isInteger(attempt) || attempt < 1 || attempt >= 3) return null;
  return new Date(now + [60_000, 5 * 60_000][attempt - 1]);
}

export function normalizedSyncItem(kind: ConnectorSyncKind, item: ConnectorSyncItem, provider: ConnectorProvider = "shoprenter") {
  const providerId = typeof item.providerId === "string" ? item.providerId.trim() : "";
  if (!providerId || providerId.length > 160) throw new Error("INVALID_PROVIDER_ID");
  const payload = (kind === "catalog_sync"
    ? { providerId, sku: String((item as CanonicalProduct).sku).slice(0, 64), name: String((item as CanonicalProduct).name).slice(0, 160), priceHuf: (item as CanonicalProduct).priceHuf, active: (item as CanonicalProduct).active, updatedAt: (item as CanonicalProduct).updatedAt }
    : kind === "order_sync"
      ? (() => { const order = item as CanonicalOrder; const reconciliation = reconcileProviderOrder({ provider, providerOrderId: providerId, status: String(order.status), totalHuf: order.totalHuf, updatedAt: order.updatedAt, handoffId: order.handoffId, offerId: order.offerId }); return { providerId, status: String(order.status).slice(0, 80), totalHuf: order.totalHuf, createdAt: order.createdAt, updatedAt: order.updatedAt, reconciliation }; })()
      : { providerId, sku: String((item as CanonicalStock).sku).slice(0, 64), quantity: (item as CanonicalStock).quantity, updatedAt: (item as CanonicalStock).updatedAt }) as { providerId: string; sku?: string; name?: string; priceHuf?: number; active?: boolean; status?: string; totalHuf?: number; createdAt?: Date; quantity?: number; updatedAt: Date | null; reconciliation?: ReconciliationDecision };
  const numeric = kind === "catalog_sync" ? [payload.priceHuf] : kind === "order_sync" ? [payload.totalHuf] : [payload.quantity];
  if (numeric.some((value) => typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 1_000_000_000)) throw new Error("INVALID_PROVIDER_VALUE");
  const checksum = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return { providerId, payload, checksum, sourceUpdatedAt: payload.updatedAt ?? null };
}

export function safeNextCursor(current: string | null, next: string | null) {
  if (next !== null && (!next.length || next.length > 500 || next === current)) throw new Error("INVALID_CURSOR");
  return next;
}
