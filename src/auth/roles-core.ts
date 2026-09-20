export const PLATFORM_ROLES = ["seller_admin", "seller_agent", "buyer", "platform_ops"] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];
export type AccessPolicy = "public" | "sso_only_refusal" | "machine" | "authenticated" | readonly PlatformRole[];

export function sellerRole(membershipRole: "owner" | "staff"): PlatformRole {
  return membershipRole === "owner" ? "seller_admin" : "seller_agent";
}

export function platformRoles(input: { systemRole?: "operator" | null; membershipRoles?: readonly ("owner" | "staff")[]; hasBuyerRelationship?: boolean }) {
  const roles = new Set<PlatformRole>();
  if (input.systemRole === "operator") roles.add("platform_ops");
  for (const role of input.membershipRoles ?? []) roles.add(sellerRole(role));
  if (input.hasBuyerRelationship) roles.add("buyer");
  return PLATFORM_ROLES.filter((role) => roles.has(role));
}

export function permits(policy: AccessPolicy, roles: readonly PlatformRole[], authenticated = roles.length > 0) {
  if (policy === "public" || policy === "sso_only_refusal" || policy === "machine") return false;
  if (policy === "authenticated") return authenticated;
  return policy.some((role) => roles.includes(role));
}

const SELLER_ROLES = ["seller_admin", "seller_agent"] as const;
const PARTICIPANT_ROLES = ["seller_admin", "seller_agent", "buyer"] as const;

export function accessPolicyForSurface(file: string, handler: string): AccessPolicy | null {
  const path = file.replaceAll("\\", "/");
  if (path.endsWith("/api/health/live/route.ts")) return "public";
  if (path.endsWith("/api/auth/login/route.ts") || path.endsWith("/auth/callback/route.ts") || path.endsWith("/api/oauth/callback/route.ts")) return "public";
  if (path.endsWith("/api/email/unsubscribe/route.ts")) return "public";
  if (path.includes("/handoff/[token]/route.ts")) return "public";
  if (path.endsWith("/api/auth/activate/route.ts") || (path.endsWith("/api/auth/session/route.ts") && handler === "POST")) return "sso_only_refusal";
  if (path.includes("/api/cron/") || path.endsWith("/api/email/inbound/route.ts") || path.endsWith("/api/postal/provider-events/route.ts") || path.endsWith("/api/health/ready/route.ts")) return "machine";
  if (path.endsWith("/account/actions.ts") || (path.endsWith("/api/auth/session/route.ts") && handler === "DELETE") || path.endsWith("/api/me/route.ts")) return "authenticated";
  if (path.endsWith("/admin/actions.ts")) return handler === "signOut" ? "authenticated" : ["platform_ops"];
  if (path.includes("/api/buyer/") || path.includes("/buyer/")) return ["buyer"];
  if (path.endsWith("/api/offers/route.ts") || path.includes("/api/offers/[offerId]/")) return ["buyer"];
  if (path.includes("/api/sellers/") || path.includes("/seller/")) return SELLER_ROLES;
  if (path.endsWith("/api/conversations/route.ts") || path.includes("/api/conversations/[conversationId]/")) return PARTICIPANT_ROLES;
  if (path.endsWith("/conversations/actions.ts")) {
    if (handler === "sendConversationMessageAction") return PARTICIPANT_ROLES;
    if (handler === "respondConversationOfferAction") return ["buyer"];
    return SELLER_ROLES;
  }
  return null;
}
