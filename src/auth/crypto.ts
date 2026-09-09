import {
  createHash,
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from "node:crypto";
const PASSWORD_VERSION = "scrypt-v1";
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

function deriveKey(
  password: string,
  salt: Buffer,
  n = SCRYPT_N,
  r = SCRYPT_R,
  p = SCRYPT_P,
) {
  return new Promise<Buffer>((resolve, reject) => {
    nodeScrypt(
      password,
      salt,
      KEY_LENGTH,
      { N: n, r, p, maxmem: 32 * 1024 * 1024 },
      (error, derived) => {
        if (error) reject(error);
        else resolve(derived);
      },
    );
  });
}

export function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("INVALID_EMAIL");
  }
  return email;
}

export function validatePassword(value: string) {
  if (value.length < 12 || value.length > 128)
    throw new Error("INVALID_PASSWORD");
  return value;
}

export async function hashPassword(password: string) {
  validatePassword(password);
  const salt = randomBytes(16);
  const derived = await deriveKey(password, salt);
  return [
    PASSWORD_VERSION,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  encoded: string | null | undefined,
) {
  if (!encoded || password.length > 128) return false;
  const [version, n, r, p, saltValue, hashValue, extra] = encoded.split("$");
  if (extra || version !== PASSWORD_VERSION) return false;
  const cost = Number(n);
  const blockSize = Number(r);
  const parallelization = Number(p);
  if (
    cost !== SCRYPT_N ||
    blockSize !== SCRYPT_R ||
    parallelization !== SCRYPT_P
  )
    return false;
  try {
    const expected = Buffer.from(hashValue, "base64url");
    if (expected.length !== KEY_LENGTH) return false;
    const actual = await deriveKey(
      password,
      Buffer.from(saltValue, "base64url"),
      cost,
      blockSize,
      parallelization,
    );
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function createOpaqueToken() {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashRateLimitKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
