export const PRIVACY_NOTICE_VERSION = "privacy-hu-2026-09-09-v1";
export const MARKETING_CHANNELS = ["email", "postal"] as const;
export const PRIVACY_REQUEST_TYPES = ["access_export", "restriction", "erasure"] as const;

export type MarketingChannel = (typeof MARKETING_CHANNELS)[number];
export type PrivacyRequestType = (typeof PRIVACY_REQUEST_TYPES)[number];

export function validatePreferenceInput(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("preferences");
  const input = value as Record<string, unknown>;
  if (typeof input.email !== "boolean" || typeof input.postal !== "boolean") {
    throw new Error("preferences");
  }
  return { email: input.email, postal: input.postal };
}

export function validatePrivacyRequestType(value: unknown): PrivacyRequestType {
  if (!PRIVACY_REQUEST_TYPES.includes(value as PrivacyRequestType)) throw new Error("requestType");
  return value as PrivacyRequestType;
}

export function validateResolution(value: unknown) {
  if (typeof value !== "string") throw new Error("resolution");
  const resolution = value.trim();
  if (!resolution || resolution.length > 500) throw new Error("resolution");
  return resolution;
}

export function isAllowedRequestTransition(current: string, next: string) {
  return (
    (current === "requested" && ["processing", "failed"].includes(next)) ||
    (current === "processing" && ["completed", "failed"].includes(next)) ||
    (current === "failed" && next === "processing")
  );
}
