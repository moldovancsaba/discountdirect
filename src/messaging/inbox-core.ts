export type InboxMode = "aggregate" | "per_seller";
export function inboxPreferenceInput(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("INVALID_INBOX_PREFERENCE");
  const value = input as Record<string, unknown>; const mode = value.mode;
  if (mode !== "aggregate" && mode !== "per_seller") throw new Error("INVALID_INBOX_PREFERENCE");
  const sellerId = typeof value.sellerId === "string" && value.sellerId ? value.sellerId : null;
  if (mode === "per_seller" && !sellerId) throw new Error("SELLER_REQUIRED");
  return { mode, sellerId: mode === "aggregate" ? null : sellerId };
}
