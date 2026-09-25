export const OFFER_STATUSES = ["draft", "pending", "accepted", "declined", "expired", "cancelled", "sold_out", "withdrawn", "redeemed"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export type OfferTransition = { from: OfferStatus; to: OfferStatus; reasonCode: string; actor: "seller" | "buyer" | "system" };

const transitions: Record<OfferStatus, Partial<Record<OfferStatus, OfferTransition["actor"]>>> = {
  draft: { pending: "seller", withdrawn: "seller" },
  pending: { accepted: "buyer", declined: "buyer", expired: "system", cancelled: "seller", sold_out: "system", withdrawn: "seller" },
  accepted: { redeemed: "system", expired: "system", cancelled: "seller", sold_out: "system", withdrawn: "seller" },
  declined: {}, expired: {}, cancelled: {}, sold_out: {}, withdrawn: {}, redeemed: {},
};

export function offerTransition(from: unknown, to: unknown, actor: unknown, reasonCode: unknown): OfferTransition {
  if (!OFFER_STATUSES.includes(from as OfferStatus) || !OFFER_STATUSES.includes(to as OfferStatus) || !["seller", "buyer", "system"].includes(String(actor)) || typeof reasonCode !== "string" || !/^[A-Z][A-Z0-9_]{2,79}$/.test(reasonCode)) throw new Error("INVALID_OFFER_TRANSITION");
  const allowed = transitions[from as OfferStatus][to as OfferStatus];
  if (allowed !== actor) throw new Error("ILLEGAL_OFFER_TRANSITION");
  return { from: from as OfferStatus, to: to as OfferStatus, actor: actor as OfferTransition["actor"], reasonCode };
}

export function offerStatusLabel(status: OfferStatus) {
  return ({ draft: "Piszkozat", pending: "Függőben", accepted: "Elfogadva", declined: "Elutasítva", expired: "Lejárt", cancelled: "Visszavonva", sold_out: "Elfogyott", withdrawn: "Visszavonva", redeemed: "Beváltva" } as const)[status];
}
