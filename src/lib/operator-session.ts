import { createHash, timingSafeEqual } from "node:crypto";

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
