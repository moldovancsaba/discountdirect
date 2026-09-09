import "server-only";
import { cookies } from "next/headers";
import { connectDatabase } from "@/lib/database";
import { User } from "./models";
import { normalizeEmail } from "./crypto";
import { authorizationUrl, createOAuthFlow, safeReturnTo, sealOAuthFlow, unsealOAuthFlow } from "./oauth-flow";
import { createUserSession } from "./service";

const SSO_ORIGIN = process.env.SSO_ORIGIN || "https://sso.doneisbetter.com";
const FLOW_COOKIE = "discountdirect-oauth-flow";
const FLOW_MAX_AGE_SECONDS = 600;
type CallbackNumber = 1 | 2;

export class SsoError extends Error {
  constructor(public code: "CONFIGURATION" | "INVALID_CALLBACK" | "ACCESS_DENIED" | "ACCOUNT_DISABLED" | "UNAVAILABLE") {
    super(code);
  }
}

function config(callback: CallbackNumber) {
  const clientId = process.env.SSO_CLIENT_ID;
  const clientSecret = process.env.SSO_CLIENT_SECRET;
  const redirectUri = process.env[`SSO_REDIRECT${callback}_URI`];
  if (!clientId || !clientSecret || !redirectUri) throw new SsoError("CONFIGURATION");
  return { clientId, clientSecret, redirectUri };
}

async function fetchWithTimeout(url: URL, init?: RequestInit) {
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(8_000) });
  } catch {
    throw new SsoError("UNAVAILABLE");
  }
}

export async function beginSsoLogin(returnTo: string | null = "/account", callback: CallbackNumber = 1) {
  const { clientId, clientSecret, redirectUri } = config(callback);
  const flow = createOAuthFlow(safeReturnTo(returnTo));
  (await cookies()).set(FLOW_COOKIE, sealOAuthFlow(flow, clientSecret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: FLOW_MAX_AGE_SECONDS,
  });
  return authorizationUrl({ origin: SSO_ORIGIN, clientId, redirectUri, flow });
}

async function syncSsoUser(input: {
  subject: string;
  email: string;
  name: string;
  permissionRole: string;
  permissionStatus: string;
}) {
  await connectDatabase();
  let email: string;
  try {
    email = normalizeEmail(input.email);
  } catch {
    throw new SsoError("INVALID_CALLBACK");
  }
  let user = await User.findOne({ ssoUserId: input.subject });
  if (!user) user = await User.findOne({ emailNormalized: email });
  if (user?.status === "disabled") throw new SsoError("ACCOUNT_DISABLED");
  if (user?.ssoUserId && user.ssoUserId !== input.subject) throw new SsoError("INVALID_CALLBACK");
  const values = {
    ssoUserId: input.subject,
    emailNormalized: email,
    displayName: input.name.slice(0, 120),
    ssoRole: input.permissionRole,
    ssoStatus: input.permissionStatus,
    lastSsoLoginAt: new Date(),
    status: "active",
  };
  if (user) {
    user.set(values);
    await user.save();
    return user;
  }
  try {
    return await User.create(values);
  } catch {
    const raced = await User.findOne({ ssoUserId: input.subject });
    if (!raced) throw new SsoError("INVALID_CALLBACK");
    return raced;
  }
}

export async function completeSsoCallback(input: {
  callback: CallbackNumber;
  code: string | null;
  state: string | null;
  providerError: string | null;
  userAgent: string;
}) {
  const { clientId, clientSecret, redirectUri } = config(input.callback);
  const store = await cookies();
  const flow = unsealOAuthFlow(store.get(FLOW_COOKIE)?.value, clientSecret);
  store.delete(FLOW_COOKIE);
  if (input.providerError) throw new SsoError("ACCESS_DENIED");
  if (!input.code || !input.state || !flow || flow.state !== input.state || Date.now() - flow.createdAt > FLOW_MAX_AGE_SECONDS * 1000) {
    throw new SsoError("INVALID_CALLBACK");
  }

  const tokenResponse = await fetchWithTimeout(new URL("/api/oauth/token", SSO_ORIGIN), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code: input.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code_verifier: flow.verifier,
    }),
  });
  if (!tokenResponse.ok) throw new SsoError("INVALID_CALLBACK");
  const tokens = (await tokenResponse.json()) as { access_token?: unknown };
  if (typeof tokens.access_token !== "string") throw new SsoError("INVALID_CALLBACK");
  const bearer = { Authorization: `Bearer ${tokens.access_token}` };
  const userResponse = await fetchWithTimeout(new URL("/api/oauth/userinfo", SSO_ORIGIN), { headers: bearer });
  if (!userResponse.ok) throw new SsoError("INVALID_CALLBACK");
  const identity = (await userResponse.json()) as { sub?: unknown; email?: unknown; name?: unknown; role?: unknown };
  if (typeof identity.sub !== "string" || typeof identity.email !== "string") throw new SsoError("INVALID_CALLBACK");

  const permissionResponse = await fetchWithTimeout(
    new URL(`/api/users/${encodeURIComponent(identity.sub)}/apps/${encodeURIComponent(clientId)}/permissions`, SSO_ORIGIN),
    { headers: bearer },
  );
  const permission = permissionResponse.ok
    ? ((await permissionResponse.json()) as { status?: unknown; role?: unknown })
    : null;
  const permissionStatus = typeof permission?.status === "string" ? permission.status : "unknown";
  const permissionRole = typeof permission?.role === "string"
    ? permission.role
    : typeof identity.role === "string" ? identity.role : "user";
  const user = await syncSsoUser({
    subject: identity.sub,
    email: identity.email,
    name: typeof identity.name === "string" && identity.name.trim() ? identity.name.trim() : identity.email,
    permissionRole,
    permissionStatus,
  });
  return { session: await createUserSession(user, input.userAgent), returnTo: flow.returnTo };
}
