import "server-only";
import { cookies } from "next/headers";
import { connectDatabase } from "@/lib/database";
import {
  AccessToken,
  BuyerRelationship,
  LoginRateLimit,
  Membership,
  Session,
  User,
} from "./models";
import {
  createOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  hashRateLimitKey,
  normalizeEmail,
  verifyPassword,
} from "./crypto";

export const USER_SESSION_COOKIE = "discountdirect-session";
const IDLE_MS = 30 * 60 * 1000;
const ABSOLUTE_MS = 12 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT = 5;
const DUMMY_PASSWORD_HASH =
  "scrypt-v1$16384$8$1$ukVOSp36X4iOIqrEHvkHLA$8kj60wNYZRxPQ3rMscdZehJ72kzsRdqmGsD22-ls0882iMuNYSxbA-7MwIi84oMpUxlbhVFR8HQSJS8CA1y7mg";

export type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string;
  systemRole: "operator" | null;
};

export class AuthError extends Error {
  constructor(
    public code:
      "INVALID_CREDENTIALS" | "RATE_LIMITED" | "INVALID_TOKEN" | "UNAUTHORIZED",
  ) {
    super(code);
  }
}

function nowPlus(milliseconds: number, now = new Date()) {
  return new Date(now.getTime() + milliseconds);
}

async function checkRateLimit(keyHash: string, now: Date) {
  let current = await LoginRateLimit.findOneAndUpdate(
    { keyHash },
    {
      $setOnInsert: {
        attempts: 0,
        windowStartedAt: now,
        expiresAt: nowPlus(RATE_WINDOW_MS, now),
        blockedUntil: null,
      },
    },
    { upsert: true, new: true },
  ).lean();
  if (current.expiresAt <= now) {
    await LoginRateLimit.updateOne(
      { _id: current._id, expiresAt: { $lte: now } },
      {
        $set: {
          attempts: 0,
          windowStartedAt: now,
          expiresAt: nowPlus(RATE_WINDOW_MS, now),
          blockedUntil: null,
        },
      },
    );
    current = (await LoginRateLimit.findById(current._id).lean())!;
  }
  if (current.blockedUntil && current.blockedUntil > now)
    throw new AuthError("RATE_LIMITED");
}

async function recordFailure(keyHash: string, now: Date) {
  const updated = await LoginRateLimit.findOneAndUpdate(
    { keyHash },
    {
      $inc: { attempts: 1 },
      $setOnInsert: {
        windowStartedAt: now,
        expiresAt: nowPlus(RATE_WINDOW_MS, now),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  if (updated.attempts >= RATE_LIMIT) {
    updated.blockedUntil = nowPlus(RATE_WINDOW_MS, now);
    updated.expiresAt = nowPlus(RATE_WINDOW_MS, now);
    await updated.save();
  }
}

export async function authenticate(
  emailValue: string,
  password: string,
  requestKey: string,
  userAgent: string,
) {
  await connectDatabase();
  let email: string;
  try {
    email = normalizeEmail(emailValue);
  } catch {
    email = "invalid";
  }
  const rateKey = hashRateLimitKey(`${requestKey}|${email}`);
  const now = new Date();
  await checkRateLimit(rateKey, now);
  const user = await User.findOne({ emailNormalized: email }).select(
    "+passwordHash",
  );
  const passwordMatches = await verifyPassword(
    password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );
  const valid = user?.status === "active" && passwordMatches;
  if (!valid) {
    await recordFailure(rateKey, now);
    throw new AuthError("INVALID_CREDENTIALS");
  }
  await LoginRateLimit.deleteOne({ keyHash: rateKey });
  const token = createOpaqueToken();
  await Session.create({
    tokenHash: hashOpaqueToken(token),
    userId: user._id,
    authVersion: user.authVersion,
    lastSeenAt: now,
    idleExpiresAt: nowPlus(IDLE_MS, now),
    absoluteExpiresAt: nowPlus(ABSOLUTE_MS, now),
    userAgentHash: hashRateLimitKey(userAgent.slice(0, 500)),
  });
  return { token, maxAge: Math.floor(ABSOLUTE_MS / 1000) };
}

export async function resolveSession(
  token?: string,
): Promise<AuthenticatedUser | null> {
  if (!token || token.length > 128) return null;
  await connectDatabase();
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
    systemRole: user.systemRole ?? null,
  };
}

export async function currentUser() {
  return resolveSession((await cookies()).get(USER_SESSION_COOKIE)?.value);
}

export async function revokeSession(token?: string) {
  if (!token) return;
  await connectDatabase();
  await Session.updateOne(
    { tokenHash: hashOpaqueToken(token), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export async function membershipsFor(userId: string) {
  await connectDatabase();
  const rows = await Membership.find({ userId, status: "active" })
    .populate("sellerId", "name slug status")
    .lean();
  return rows.map((row) => {
    const seller = row.sellerId as unknown as {
      _id: { toString(): string };
      name: string;
      slug: string;
      status: string;
    };
    return {
      id: row._id.toString(),
      sellerId: seller._id.toString(),
      name: seller.name,
      slug: seller.slug,
      sellerStatus: seller.status,
      role: row.role as "owner" | "staff",
    };
  });
}

export async function buyerRelationshipsFor(userId: string) {
  await connectDatabase();
  const rows = await BuyerRelationship.find({
    buyerUserId: userId,
    status: "active",
  })
    .populate("sellerId", "name slug status")
    .lean();
  return rows.map((row) => {
    const seller = row.sellerId as unknown as {
      _id: { toString(): string };
      name: string;
      slug: string;
      status: string;
    };
    return {
      id: row._id.toString(),
      sellerId: seller._id.toString(),
      name: seller.name,
      slug: seller.slug,
      sellerStatus: seller.status,
    };
  });
}

export async function activateWithToken(token: string, password: string) {
  if (token.length > 128) throw new AuthError("INVALID_TOKEN");
  const database = await connectDatabase();
  const passwordHash = await hashPassword(password);
  const now = new Date();
  await database.connection.transaction(async (transaction) => {
    const accessToken = await AccessToken.findOneAndUpdate(
      {
        tokenHash: hashOpaqueToken(token),
        purpose: { $in: ["activation", "recovery"] },
        consumedAt: null,
        revokedAt: null,
        expiresAt: { $gt: now },
      },
      { $set: { consumedAt: now } },
      { new: true, session: transaction },
    );
    if (!accessToken) throw new AuthError("INVALID_TOKEN");
    const user = await User.findByIdAndUpdate(
      accessToken.userId,
      { $set: { passwordHash, status: "active" }, $inc: { authVersion: 1 } },
      { new: true, session: transaction },
    );
    if (!user) throw new AuthError("INVALID_TOKEN");
    await Session.updateMany(
      { userId: user._id, revokedAt: null },
      { $set: { revokedAt: now } },
      { session: transaction },
    );
  });
}
