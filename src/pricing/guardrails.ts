import type { CustomerSegment } from "@/relationships/segments";
import type { SellerSettings } from "@/settings/validation";

export type PricingDecision =
  | { allowed: true; discountPct: number; minimumPct: number; maximumPct: number; mode: SellerSettings["discount_mode"] }
  | { allowed: false; reasonCode: "DISCOUNT_NOT_INTEGER" | "DISCOUNT_OUTSIDE_GUARDRAILS" | "DISCOUNT_STEP_NOT_ALLOWED"; minimumPct: number; maximumPct: number; mode: SellerSettings["discount_mode"] };

export function decideDiscount(settings: SellerSettings, segment: CustomerSegment, value: unknown): PricingDecision {
  const segmentMaximum = settings.discount_guardrails.per_segment_max[segment];
  const maximumPct = Math.min(settings.discount_guardrails.max_pct, 100 - settings.discount_guardrails.margin_floor_pct, segmentMaximum ?? 100);
  const minimumPct = settings.discount_guardrails.floor_pct;
  if (!Number.isInteger(value)) return { allowed: false, reasonCode: "DISCOUNT_NOT_INTEGER", minimumPct, maximumPct, mode: settings.discount_mode };
  const discountPct = Number(value);
  if (discountPct < minimumPct || discountPct > maximumPct) return { allowed: false, reasonCode: "DISCOUNT_OUTSIDE_GUARDRAILS", minimumPct, maximumPct, mode: settings.discount_mode };
  if (settings.discount_mode === "steps" && !settings.discount_steps.includes(discountPct)) return { allowed: false, reasonCode: "DISCOUNT_STEP_NOT_ALLOWED", minimumPct, maximumPct, mode: settings.discount_mode };
  return { allowed: true, discountPct, minimumPct, maximumPct, mode: settings.discount_mode };
}
