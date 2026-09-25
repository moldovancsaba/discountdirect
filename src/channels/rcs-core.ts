import { createHmac, timingSafeEqual } from "node:crypto";

export const RCS_PROVIDER = "rcs";

export type RcsMessage = {
  fallbackText: string;
  title?: string;
  deepLink?: string;
  imageUrl?: string;
};

export function normalizeRcsNumber(value: unknown) {
  if (typeof value !== "string") throw new Error("RCS_NUMBER_INVALID");
  const normalized = value.replace(/[\s().-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new Error("RCS_NUMBER_INVALID");
  return normalized;
}

export function validateRcsMessage(message: RcsMessage) {
  if (!message.fallbackText.trim() || message.fallbackText.length > 640) throw new Error("RCS_MESSAGE_INVALID");
  if (message.title !== undefined && (!message.title.trim() || message.title.length > 120)) throw new Error("RCS_MESSAGE_INVALID");
  if (message.deepLink !== undefined && !/^https:\/\//.test(message.deepLink)) throw new Error("RCS_MESSAGE_INVALID");
  if (message.imageUrl !== undefined && !/^https:\/\//.test(message.imageUrl)) throw new Error("RCS_MESSAGE_INVALID");
  return { ...message };
}

export function rcsRetryable(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function verifyRcsCallback(payload: string, timestamp: string, signature: string, secret: string, now = Date.now()) {
  const epoch = Number(timestamp);
  if (!secret || secret.length < 32 || !Number.isFinite(epoch) || Math.abs(now - epoch * 1000) > 5 * 60_000) throw new Error("RCS_CALLBACK_INVALID");
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error("RCS_CALLBACK_INVALID");
  return true;
}
