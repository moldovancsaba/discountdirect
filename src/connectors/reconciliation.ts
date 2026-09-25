export type ReconciliationOrder = {
  provider: "shoprenter" | "unas";
  providerOrderId: string;
  status: string;
  totalHuf: number;
  updatedAt: Date | null;
  handoffId?: string | null;
  offerId?: string | null;
};

export type ReconciliationDecision = {
  providerOrderId: string;
  state: "completed" | "refunded" | "cancelled" | "unmatched" | "reconciliation_required";
  matchedOfferId: string | null;
  reasonCode: "VERIFIED_HANDOFF" | "VERIFIED_OFFER_REFERENCE" | "NO_ATTRIBUTION" | "UNSUPPORTED_STATUS" | "INVALID_ORDER";
  idempotencyKey: string;
};

const completed = new Set(["paid", "completed", "complete", "shipped", "delivered", "order_confirm", "confirmed"]);
const refunded = new Set(["refunded", "refund", "returned"]);
const cancelled = new Set(["cancelled", "canceled", "void", "rejected"]);

export function reconcileProviderOrder(order: ReconciliationOrder): ReconciliationDecision {
  const providerOrderId = order.providerOrderId.trim();
  const status = order.status.trim().toLowerCase();
  const idempotencyKey = `commerce:${order.provider}:${providerOrderId}:${order.updatedAt?.toISOString() ?? "unknown"}:${status}`;
  if (!providerOrderId || providerOrderId.length > 160 || !Number.isInteger(order.totalHuf) || order.totalHuf < 0) {
    return { providerOrderId: providerOrderId || "invalid", state: "reconciliation_required", matchedOfferId: null, reasonCode: "INVALID_ORDER", idempotencyKey };
  }
  const matchedOfferId = typeof order.offerId === "string" && order.offerId.trim() ? order.offerId.trim() : null;
  const attributed = matchedOfferId ? "VERIFIED_OFFER_REFERENCE" : order.handoffId?.trim() ? "VERIFIED_HANDOFF" : "NO_ATTRIBUTION";
  if (completed.has(status)) return { providerOrderId, state: matchedOfferId || order.handoffId ? "completed" : "unmatched", matchedOfferId, reasonCode: attributed, idempotencyKey };
  if (refunded.has(status)) return { providerOrderId, state: "refunded", matchedOfferId, reasonCode: matchedOfferId || order.handoffId ? attributed : "NO_ATTRIBUTION", idempotencyKey };
  if (cancelled.has(status)) return { providerOrderId, state: "cancelled", matchedOfferId, reasonCode: matchedOfferId || order.handoffId ? attributed : "NO_ATTRIBUTION", idempotencyKey };
  return { providerOrderId, state: "reconciliation_required", matchedOfferId, reasonCode: "UNSUPPORTED_STATUS", idempotencyKey };
}
