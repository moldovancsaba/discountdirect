export const SEGMENT_RULE_VERSION = "segments-2026-09-v1";
export type CustomerSegment = "new" | "returning" | "loyal";

export function deriveCustomerSegment(orderCount: number, firstOrderAt: Date | null, lastOrderAt: Date | null): CustomerSegment {
  if (!Number.isInteger(orderCount) || orderCount < 0) throw new Error("orderCount");
  if (orderCount <= 1) return "new";
  if (!firstOrderAt || !lastOrderAt || lastOrderAt < firstOrderAt) return "returning";
  const tenureDays = Math.floor((lastOrderAt.getTime() - firstOrderAt.getTime()) / (24 * 60 * 60 * 1000));
  return orderCount >= 4 && tenureDays >= 180 ? "loyal" : "returning";
}
