import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type OAuthFlow = {
  state: string;
  nonce: string;
  verifier: string;
  challenge: string;
  returnTo: string;
  createdAt: number;
};

export function safeReturnTo(value: string | null | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/account";
}

export function createOAuthFlow(returnTo = "/account"): OAuthFlow {
  const verifier = randomBytes(48).toString("base64url");
  return {
    state: randomBytes(24).toString("base64url"),
    nonce: randomBytes(24).toString("base64url"),
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
    returnTo: safeReturnTo(returnTo),
    createdAt: Date.now(),
  };
}

function signature(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function sealOAuthFlow(flow: OAuthFlow, secret: string) {
  const encoded = Buffer.from(JSON.stringify(flow)).toString("base64url");
  return `${encoded}.${signature(encoded, secret)}`;
}

export function unsealOAuthFlow(value: string | undefined, secret: string) {
  if (!value) return null;
  const [encoded, supplied, extra] = value.split(".");
  if (!encoded || !supplied || extra) return null;
  const expected = signature(encoded, secret);
  const actualBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as OAuthFlow;
  } catch {
    return null;
  }
}

export function authorizationUrl(input: { origin: string; clientId: string; redirectUri: string; flow: OAuthFlow }) {
  const url = new URL("/api/oauth/authorize", input.origin);
  url.search = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: "openid profile email offline_access",
    state: input.flow.state,
    nonce: input.flow.nonce,
    code_challenge: input.flow.challenge,
    code_challenge_method: "S256",
  }).toString();
  return url;
}
