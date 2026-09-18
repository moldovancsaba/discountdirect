export const SELLER_SETTINGS_DEFAULTS = {
  inbox_mode: "per_seller",
  discount_mode: "steps",
  discount_steps: [10, 15, 20, 25],
  discount_guardrails: { floor_pct: 0, max_pct: 30, margin_floor_pct: 10, per_segment_max: {} },
  newsletter_discount_rule: { mode: "recommendation_pct", fixed_pct: 10 },
  print_mode: "seller",
  consent_scope: "per_seller",
  compensation_mode: "preset",
  compensation_presets: ["voucher", "free_delivery", "priority_next_campaign"],
  frequency_cap: { email_per_30d: 4, chat_per_7d: 3, mailing_per_90d: 1, rcs_per_7d: 1 },
  holdout_pct: 10,
  holdout_mode: "pooled",
  min_outcomes_for_learning: 2000,
  early_access_minutes: 60,
  flash_defaults: { pct: 15, limit_hours: 24, limit_qty_total: 20, limit_qty_per_buyer: 1, channels: ["chat", "email"] },
  list_defaults: { frequency: "biweekly", channels: ["email"] },
  reason_editable: true,
  advanced_mode: { offers: false, campaigns: false, lists: false, compensation: false, incentives: false, timing: false, consent: false },
  checkout_handoff: { mode: "signed_link", price_lock_minutes: 60 },
} as const;

export type SellerSettings = {
  inbox_mode: "per_seller" | "marketplace";
  discount_mode: "steps" | "guardrails";
  discount_steps: number[];
  discount_guardrails: { floor_pct: number; max_pct: number; margin_floor_pct: number; per_segment_max: Record<string, number> };
  newsletter_discount_rule: { mode: "recommendation_pct" | "fixed"; fixed_pct: number };
  print_mode: "seller" | "platform_service";
  consent_scope: "per_seller" | "inbox";
  compensation_mode: "preset" | "manual";
  compensation_presets: ("voucher" | "free_delivery" | "priority_next_campaign")[];
  frequency_cap: { email_per_30d: number; chat_per_7d: number; mailing_per_90d: number; rcs_per_7d: number };
  holdout_pct: number;
  holdout_mode: "per_campaign" | "pooled";
  min_outcomes_for_learning: number;
  early_access_minutes: number;
  flash_defaults: { pct: number; limit_hours: number; limit_qty_total: number; limit_qty_per_buyer: number; channels: ("chat" | "email" | "mailing")[] };
  list_defaults: { frequency: "weekly" | "biweekly" | "monthly"; channels: ("chat" | "email" | "mailing")[] };
  reason_editable: boolean;
  advanced_mode: { offers: boolean; campaigns: boolean; lists: boolean; compensation: boolean; incentives: boolean; timing: boolean; consent: boolean };
  checkout_handoff: { mode: "signed_link" | "cart_token"; price_lock_minutes: number };
};

const topKeys = new Set(Object.keys(SELLER_SETTINGS_DEFAULTS));
const channels = ["chat", "email", "mailing"] as const;

function record(value: unknown, field: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(field);
  return value as Record<string, unknown>;
}

function exact(row: Record<string, unknown>, keys: readonly string[], field: string) {
  if (Object.keys(row).some((key) => !keys.includes(key))) throw new Error(field);
}

function integer(value: unknown, min: number, max: number, field: string) {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) throw new Error(field);
  return Number(value);
}

function oneOf<T extends string>(value: unknown, values: readonly T[], field: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new Error(field);
  return value as T;
}

function booleans(value: unknown, keys: readonly string[], field: string) {
  const row = record(value, field);
  exact(row, keys, field);
  return Object.fromEntries(keys.map((key) => {
    if (typeof row[key] !== "boolean") throw new Error(`${field}.${key}`);
    return [key, row[key]];
  })) as Record<string, boolean>;
}

export function validateSellerSettings(value: unknown): SellerSettings {
  const input = record(value, "settings");
  if (Object.keys(input).some((key) => !topKeys.has(key))) throw new Error("settings.unknown_key");
  const merged = { ...SELLER_SETTINGS_DEFAULTS, ...input } as Record<string, unknown>;
  const guardrails = record(merged.discount_guardrails, "discount_guardrails");
  exact(guardrails, ["floor_pct", "max_pct", "margin_floor_pct", "per_segment_max"], "discount_guardrails");
  const segmentInput = record(guardrails.per_segment_max, "discount_guardrails.per_segment_max");
  const perSegmentMax = Object.fromEntries(Object.entries(segmentInput).map(([key, amount]) => {
    if (!/^[a-z0-9_-]{1,40}$/.test(key)) throw new Error("discount_guardrails.per_segment_max");
    return [key, integer(amount, 0, 100, `discount_guardrails.per_segment_max.${key}`)];
  }));
  const floorPct = integer(guardrails.floor_pct, 0, 100, "discount_guardrails.floor_pct");
  const maxPct = integer(guardrails.max_pct, 0, 100, "discount_guardrails.max_pct");
  if (floorPct > maxPct) throw new Error("discount_guardrails.range");
  const newsletter = record(merged.newsletter_discount_rule, "newsletter_discount_rule");
  exact(newsletter, ["mode", "fixed_pct"], "newsletter_discount_rule");
  const frequency = record(merged.frequency_cap, "frequency_cap");
  exact(frequency, ["email_per_30d", "chat_per_7d", "mailing_per_90d", "rcs_per_7d"], "frequency_cap");
  const flash = record(merged.flash_defaults, "flash_defaults");
  exact(flash, ["pct", "limit_hours", "limit_qty_total", "limit_qty_per_buyer", "channels"], "flash_defaults");
  const list = record(merged.list_defaults, "list_defaults");
  exact(list, ["frequency", "channels"], "list_defaults");
  const checkout = record(merged.checkout_handoff, "checkout_handoff");
  exact(checkout, ["mode", "price_lock_minutes"], "checkout_handoff");
  const steps = merged.discount_steps;
  if (!Array.isArray(steps) || !steps.length || steps.length > 10) throw new Error("discount_steps");
  const discountSteps = [...new Set(steps.map((step) => integer(step, 0, 100, "discount_steps")))].sort((a, b) => a - b);
  const compensation = merged.compensation_presets;
  if (!Array.isArray(compensation)) throw new Error("compensation_presets");
  const compensationPresets = [...new Set(compensation.map((item) => oneOf(item, ["voucher", "free_delivery", "priority_next_campaign"] as const, "compensation_presets")))];
  const channelList = (value: unknown, field: string) => {
    if (!Array.isArray(value) || !value.length) throw new Error(field);
    return [...new Set(value.map((item) => oneOf(item, channels, field)))];
  };
  if (typeof merged.reason_editable !== "boolean") throw new Error("reason_editable");
  return {
    inbox_mode: oneOf(merged.inbox_mode, ["per_seller", "marketplace"] as const, "inbox_mode"),
    discount_mode: oneOf(merged.discount_mode, ["steps", "guardrails"] as const, "discount_mode"),
    discount_steps: discountSteps,
    discount_guardrails: { floor_pct: floorPct, max_pct: maxPct, margin_floor_pct: integer(guardrails.margin_floor_pct, 0, 100, "discount_guardrails.margin_floor_pct"), per_segment_max: perSegmentMax },
    newsletter_discount_rule: { mode: oneOf(newsletter.mode, ["recommendation_pct", "fixed"] as const, "newsletter_discount_rule.mode"), fixed_pct: integer(newsletter.fixed_pct, 0, 100, "newsletter_discount_rule.fixed_pct") },
    print_mode: oneOf(merged.print_mode, ["seller", "platform_service"] as const, "print_mode"),
    consent_scope: oneOf(merged.consent_scope, ["per_seller", "inbox"] as const, "consent_scope"),
    compensation_mode: oneOf(merged.compensation_mode, ["preset", "manual"] as const, "compensation_mode"),
    compensation_presets: compensationPresets,
    frequency_cap: { email_per_30d: integer(frequency.email_per_30d, 0, 100, "frequency_cap.email_per_30d"), chat_per_7d: integer(frequency.chat_per_7d, 0, 100, "frequency_cap.chat_per_7d"), mailing_per_90d: integer(frequency.mailing_per_90d, 0, 100, "frequency_cap.mailing_per_90d"), rcs_per_7d: integer(frequency.rcs_per_7d, 0, 100, "frequency_cap.rcs_per_7d") },
    holdout_pct: integer(merged.holdout_pct, 0, 20, "holdout_pct"),
    holdout_mode: oneOf(merged.holdout_mode, ["per_campaign", "pooled"] as const, "holdout_mode"),
    min_outcomes_for_learning: integer(merged.min_outcomes_for_learning, 1, 10_000_000, "min_outcomes_for_learning"),
    early_access_minutes: integer(merged.early_access_minutes, 0, 10_080, "early_access_minutes"),
    flash_defaults: { pct: integer(flash.pct, 0, 100, "flash_defaults.pct"), limit_hours: integer(flash.limit_hours, 1, 168, "flash_defaults.limit_hours"), limit_qty_total: integer(flash.limit_qty_total, 1, 1_000_000, "flash_defaults.limit_qty_total"), limit_qty_per_buyer: integer(flash.limit_qty_per_buyer, 1, 100, "flash_defaults.limit_qty_per_buyer"), channels: channelList(flash.channels, "flash_defaults.channels") },
    list_defaults: { frequency: oneOf(list.frequency, ["weekly", "biweekly", "monthly"] as const, "list_defaults.frequency"), channels: channelList(list.channels, "list_defaults.channels") },
    reason_editable: merged.reason_editable,
    advanced_mode: booleans(merged.advanced_mode, ["offers", "campaigns", "lists", "compensation", "incentives", "timing", "consent"], "advanced_mode") as SellerSettings["advanced_mode"],
    checkout_handoff: { mode: oneOf(checkout.mode, ["signed_link", "cart_token"] as const, "checkout_handoff.mode"), price_lock_minutes: integer(checkout.price_lock_minutes, 1, 1440, "checkout_handoff.price_lock_minutes") },
  };
}
