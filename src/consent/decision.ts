export type MarketingChannel = "email" | "postal";
export type LegalBasis = "consent" | "legitimate_interest";
export type SendDecisionReason =
  | "ALLOWED_CONSENT"
  | "ALLOWED_LEGITIMATE_INTEREST"
  | "RELATIONSHIP_INACTIVE"
  | "CUSTOMER_INACTIVE"
  | "CHANNEL_OBJECTED"
  | "CONSENT_REQUIRED"
  | "SOFT_OPT_IN_UNAVAILABLE"
  | "NO_PURCHASE_RELATIONSHIP"
  | "FREQUENCY_CAP_REACHED";

export type SendDecision = { allowed: boolean; reasonCode: SendDecisionReason; cap?: number; count?: number };

export function decideMarketingSend(input: {
  basis: LegalBasis;
  softOptIn: boolean;
  relationshipActive: boolean;
  customerActive: boolean;
  preferenceStatus: "subscribed" | "unsubscribed" | null;
  orderCount: number;
  frequencyCount: number;
  frequencyCap: number;
}): SendDecision {
  if (!input.relationshipActive) return { allowed: false, reasonCode: "RELATIONSHIP_INACTIVE" };
  if (!input.customerActive) return { allowed: false, reasonCode: "CUSTOMER_INACTIVE" };
  if (input.preferenceStatus === "unsubscribed") return { allowed: false, reasonCode: "CHANNEL_OBJECTED" };
  if (input.frequencyCount >= input.frequencyCap) return { allowed: false, reasonCode: "FREQUENCY_CAP_REACHED", cap: input.frequencyCap, count: input.frequencyCount };
  if (input.basis === "consent") {
    return input.preferenceStatus === "subscribed"
      ? { allowed: true, reasonCode: "ALLOWED_CONSENT", cap: input.frequencyCap, count: input.frequencyCount }
      : { allowed: false, reasonCode: "CONSENT_REQUIRED" };
  }
  if (!input.softOptIn) return { allowed: false, reasonCode: "SOFT_OPT_IN_UNAVAILABLE" };
  if (input.orderCount < 1) return { allowed: false, reasonCode: "NO_PURCHASE_RELATIONSHIP" };
  return { allowed: true, reasonCode: "ALLOWED_LEGITIMATE_INTEREST", cap: input.frequencyCap, count: input.frequencyCount };
}
