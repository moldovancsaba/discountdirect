import { connectDatabaseCore } from "../lib/database-core.ts";
import { Session, User } from "./models.ts";
import { hashOpaqueToken, hashRateLimitKey } from "./crypto.ts";

export const USER_SESSION_COOKIE = "discountdirect-session";
const IDLE_MS = 30 * 60 * 1000;

export type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string;
  systemRole: "operator" | null;
};

function nowPlus(milliseconds: number, now = new Date()) {
  return new Date(now.getTime() + milliseconds);
}

export async function resolveSessionToken(
  token?: string,
): Promise<AuthenticatedUser | null> {
  if (!token || token.length > 128) return null;
  await connectDatabaseCore();
  const now = new Date();
  const session = await Session.findOne({
    tokenHash: hashOpaqueToken(token),
    revokedAt: null,
    idleExpiresAt: { $gt: now },
    absoluteExpiresAt: { $gt: now },
  }).lean();
  if (!session) return null;
  const user = await User.findOne({
    _id: session.userId,
    status: "active",
    authVersion: session.authVersion,
  }).lean();
  if (!user) return null;
  if (now.getTime() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await Session.updateOne(
      { _id: session._id, revokedAt: null },
      { $set: { lastSeenAt: now, idleExpiresAt: nowPlus(IDLE_MS, now) } },
    );
  }
  return {
    id: user._id.toString(),
    email: user.emailNormalized,
    displayName: user.displayName,
    systemRole:
      user.systemRole ??
      (user.ssoStatus === "approved" && user.ssoRole === "admin"
        ? "operator"
        : null),
  };
}

export async function revokeSessionToken(token?: string) {
  if (!token) return;
  await connectDatabaseCore();
  await Session.updateOne(
    { tokenHash: hashOpaqueToken(token), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export function sessionUserAgentHash(userAgent: string) {
  return hashRateLimitKey(userAgent.slice(0, 500));
}
