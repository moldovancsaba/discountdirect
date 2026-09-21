import { SELLER_SETTINGS_DEFAULTS, validateSellerSettings, type SellerSettings } from "./validation.ts";
/* eslint-disable @typescript-eslint/no-explicit-any -- Recursive validated settings objects cross a dynamic schema boundary. */

export type OverrideMode = "predefined" | "advanced";
export const DEFAULT_TEMPLATE_KEY = "hu-commerce-default";
export const LEGAL_LOCKS = ["consent_scope", "checkout_handoff.mode", "frequency_cap"] as const;

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function deepMerge(base: Record<string, any>, override: Record<string, any>): Record<string, any> { const output = clone(base); for (const [key, value] of Object.entries(override)) output[key] = value && typeof value === "object" && !Array.isArray(value) && output[key] && typeof output[key] === "object" ? deepMerge(output[key], value as Record<string, any>) : clone(value); return output; }

export function resolveEffectiveRules(input: { templateValues?: unknown; overrideMode: OverrideMode; overrideValues?: unknown }) {
  const template = validateSellerSettings(input.templateValues ?? SELLER_SETTINGS_DEFAULTS);
  const requested = input.overrideMode === "advanced" ? validateSellerSettings(deepMerge(template as unknown as Record<string, any>, (input.overrideValues ?? {}) as Record<string, any>)) : template;
  const resolved = clone(requested) as SellerSettings;
  resolved.consent_scope = template.consent_scope;
  resolved.checkout_handoff.mode = template.checkout_handoff.mode;
  resolved.frequency_cap = {
    email_per_30d: Math.min(requested.frequency_cap.email_per_30d, template.frequency_cap.email_per_30d),
    chat_per_7d: Math.min(requested.frequency_cap.chat_per_7d, template.frequency_cap.chat_per_7d),
    mailing_per_90d: Math.min(requested.frequency_cap.mailing_per_90d, template.frequency_cap.mailing_per_90d),
    rcs_per_7d: Math.min(requested.frequency_cap.rcs_per_7d, template.frequency_cap.rcs_per_7d),
  };
  return { resolved: validateSellerSettings(resolved), legalLocks: [...LEGAL_LOCKS], clamped: JSON.stringify(requested) !== JSON.stringify(resolved) };
}

export function ruleDiff(template: SellerSettings, effective: SellerSettings) { return Object.keys(template).filter((key) => JSON.stringify(template[key as keyof SellerSettings]) !== JSON.stringify(effective[key as keyof SellerSettings])); }
