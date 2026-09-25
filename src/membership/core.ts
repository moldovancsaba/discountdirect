export const MEMBERSHIP_RULE_VERSION = "membership-2026-09-25-v1";
export type MembershipTier = "member" | "silver" | "gold";
export type MembershipBenefits = { freeDelivery: boolean; earlyAccessHours: number };
export function deriveMembershipTier(orderCount: number, totalHuf: number): MembershipTier {
  if (!Number.isInteger(orderCount) || orderCount < 0 || !Number.isInteger(totalHuf) || totalHuf < 0) throw new Error("INVALID_MEMBERSHIP_METRICS");
  if (orderCount >= 10 || totalHuf >= 500_000) return "gold";
  if (orderCount >= 5 || totalHuf >= 200_000) return "silver";
  return "member";
}
export function membershipBenefits(tier: MembershipTier): MembershipBenefits {
  if (tier === "gold") return { freeDelivery: true, earlyAccessHours: 48 };
  if (tier === "silver") return { freeDelivery: true, earlyAccessHours: 24 };
  return { freeDelivery: false, earlyAccessHours: 0 };
}
export function membershipDecision(input: { status: "active" | "left"; tier: MembershipTier; campaignStartsAt: Date; now: Date; consentAllowed: boolean }) {
  const benefits = membershipBenefits(input.tier);
  const earlyAccess = input.status === "active" && input.consentAllowed && input.now.getTime() >= input.campaignStartsAt.getTime() - benefits.earlyAccessHours * 3_600_000;
  return { ruleVersion: MEMBERSHIP_RULE_VERSION, eligible: input.status === "active" && input.consentAllowed, earlyAccess, benefits };
}
