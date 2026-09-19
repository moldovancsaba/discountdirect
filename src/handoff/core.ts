import { createHmac, timingSafeEqual } from "node:crypto";
export type HandoffClaims = { handoffId: string; offerId: string; sellerId: string; buyerUserId: string; priceHuf: number; expiresAt: number; nonce: string };
const encode = (value: string) => Buffer.from(value).toString("base64url");
export function signHandoff(claims: HandoffClaims, secret: string) {
  if (secret.length < 32) throw new Error("HANDOFF_SECRET_WEAK");
  const payload = encode(JSON.stringify(claims)); const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
export function verifyHandoff(token: string, secret: string, now = Date.now()): HandoffClaims {
  const [payload, signature, extra] = token.split("."); if (!payload || !signature || extra || secret.length < 32) throw new Error("HANDOFF_INVALID");
  const expected = createHmac("sha256", secret).update(payload).digest(); const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("HANDOFF_INVALID");
  const value = JSON.parse(Buffer.from(payload, "base64url").toString()) as HandoffClaims;
  if (!value.handoffId || !value.offerId || !value.sellerId || !value.buyerUserId || !value.nonce || !Number.isInteger(value.priceHuf) || !Number.isFinite(value.expiresAt) || value.expiresAt <= now) throw new Error("HANDOFF_EXPIRED");
  return value;
}
