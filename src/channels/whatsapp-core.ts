import { createHmac, timingSafeEqual } from "node:crypto";

export const WHATSAPP_PROVIDER = "whatsapp";
export type WhatsAppStatus = "accepted" | "delivered" | "read" | "failed" | "rejected";
export type WhatsAppTemplate = { name: string; language: string; variables: string[] };

export function normalizeWhatsAppNumber(value: unknown) {
  if (typeof value !== "string") throw new Error("WHATSAPP_NUMBER_INVALID");
  const normalized = value.replace(/[\s().-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new Error("WHATSAPP_NUMBER_INVALID");
  return normalized;
}

export function validateWhatsAppTemplate(template: WhatsAppTemplate, values: Record<string, string>) {
  if (!/^[a-z0-9_]{2,80}$/.test(template.name) || !/^[a-z]{2,5}(?:_[A-Z]{2})?$/.test(template.language)) throw new Error("WHATSAPP_TEMPLATE_INVALID");
  const keys = Object.keys(values);
  if (template.variables.length > 20 || keys.length !== template.variables.length || keys.some((key) => !template.variables.includes(key) || values[key]!.length > 500)) throw new Error("WHATSAPP_TEMPLATE_VARIABLES_INVALID");
  return { name: template.name, language: template.language, variables: Object.fromEntries(template.variables.map((key) => [key, values[key]])) };
}

export function whatsappRetryable(status: number) { return status === 408 || status === 425 || status === 429 || status >= 500; }

export function verifyWhatsAppCallback(payload: string, timestamp: string, signature: string, secret: string, now = Date.now()) {
  const epoch = Number(timestamp);
  if (!secret || secret.length < 32 || !Number.isFinite(epoch) || Math.abs(now - epoch * 1000) > 5 * 60_000) throw new Error("WHATSAPP_CALLBACK_INVALID");
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error("WHATSAPP_CALLBACK_INVALID");
  return true;
}
