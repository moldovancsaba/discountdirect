export const ATTRIBUTION_RULE_VERSION = "attribution-2026-09-25-v1";
export type AttributionInput = { orderId: string; orderAt: Date; revenueHuf: number; quantity?: number; refundedHuf?: number; signedOfferId?: string | null; signedHandoffId?: string | null; campaignOfferId?: string | null; campaignCreatedAt?: Date | null; campaignExpiresAt?: Date | null };
export type ProductCostRevision = { unitCostHuf: number; effectiveAt: Date; version: number };
export type AttributionResult = { ruleVersion: string; orderId: string; method: "signed_handoff" | "campaign_window" | "unattributed"; offerId: string | null; confidence: "high" | "medium" | "low"; warning: "NONE" | "REFUND_EXCEEDS_REVENUE" | "MISSING_COST" | "INSUFFICIENT_EVIDENCE"; netRevenueHuf: number; marginHuf: number | null; costVersion: number | null };
function boundedMoney(value: number) { return Number.isInteger(value) && value >= 0 && value <= 1_000_000_000; }
export function attributeOrder(input: AttributionInput, cost: ProductCostRevision | null = null, minimumSample = 5): AttributionResult {
  const quantity = input.quantity ?? 1;
  const valid = typeof input.orderId === "string" && input.orderId.length > 0 && boundedMoney(input.revenueHuf) && Number.isInteger(quantity) && quantity >= 1 && quantity <= 100_000 && (input.refundedHuf === undefined || boundedMoney(input.refundedHuf));
  const netRevenueHuf = valid ? Math.max(0, input.revenueHuf - (input.refundedHuf ?? 0)) : 0;
  const signed = input.signedOfferId && input.signedHandoffId ? "signed_handoff" : null;
  const inWindow = Boolean(input.campaignOfferId && input.campaignCreatedAt && input.campaignExpiresAt && input.orderAt >= input.campaignCreatedAt && input.orderAt <= input.campaignExpiresAt);
  const method = signed ?? (inWindow ? "campaign_window" : "unattributed");
  const offerId = method === "signed_handoff" ? input.signedOfferId! : method === "campaign_window" ? input.campaignOfferId! : null;
  const warning = !valid ? "INSUFFICIENT_EVIDENCE" : method === "unattributed" ? "INSUFFICIENT_EVIDENCE" : input.refundedHuf && input.refundedHuf > input.revenueHuf ? "REFUND_EXCEEDS_REVENUE" : !cost ? "MISSING_COST" : "NONE";
  const marginHuf = warning === "NONE" && cost ? netRevenueHuf - cost.unitCostHuf * quantity : null;
  return { ruleVersion: ATTRIBUTION_RULE_VERSION, orderId: input.orderId, method, offerId, confidence: method === "signed_handoff" ? "high" : method === "campaign_window" && minimumSample >= 5 ? "medium" : "low", warning, netRevenueHuf, marginHuf, costVersion: cost?.version ?? null };
}
