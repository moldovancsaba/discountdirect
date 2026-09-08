import {
  createHmac,
  createHash,
  timingSafeEqual,
  randomBytes,
} from "node:crypto";
export const SESSION_COOKIE = "discountdirect-operator";
export const SESSION_SECONDS = 3600;
export function validSecret(secret: string | undefined): secret is string {
  return Boolean(secret && secret.length >= 32);
}
export function matchesToken(candidate: string, secret: string | undefined) {
  if (!validSecret(secret) || candidate.length > 1024) return false;
  return timingSafeEqual(
    createHash("sha256").update(candidate).digest(),
    createHash("sha256").update(secret).digest(),
  );
}
export function createSession(secret: string, now = Date.now()) {
  if (!validSecret(secret)) throw new Error("OPERATIONS_NOT_CONFIGURED");
  const payload = `${now + SESSION_SECONDS * 1000}.${randomBytes(24).toString("hex")}`;
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("hex")}`;
}
export function verifySession(
  value: string | undefined,
  secret: string | undefined,
  now = Date.now(),
) {
  if (
    !value ||
    !validSecret(secret) ||
    !/^\d{13}\.[a-f0-9]{48}\.[a-f0-9]{64}$/.test(value)
  )
    return false;
  const [expires, nonce, signature] = value.split(".");
  const expiry = Number(expires);
  if (expiry <= now || expiry > now + SESSION_SECONDS * 1000) return false;
  const expected = createHmac("sha256", secret)
    .update(`${expires}.${nonce}`)
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
