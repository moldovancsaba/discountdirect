import "server-only";
import { cookies } from "next/headers";
import { connectDatabase } from "@/lib/database";
import {
  BuyerRelationship,
  Membership,
  Session,
} from "./models";
import {
  resolveSessionToken,
  revokeSessionToken,
  sessionUserAgentHash,
  USER_SESSION_COOKIE,
} from "./session-core.ts";
import {
  createOpaqueToken,
  hashOpaqueToken,
} from "./crypto";

export { USER_SESSION_COOKIE } from "./session-core.ts";
export type { AuthenticatedUser } from "./session-core.ts";

const IDLE_MS = 30 * 60 * 1000;
const ABSOLUTE_MS = 12 * 60 * 60 * 1000;

export async function createUserSession(
  user: { _id: unknown; authVersion: number },
  userAgent: string,
) {
  const now = new Date();
  const token = createOpaqueToken();
  await Session.create({
    tokenHash: hashOpaqueToken(token),
    userId: user._id,
    authVersion: user.authVersion,
    lastSeenAt: now,
    idleExpiresAt: nowPlus(IDLE_MS, now),
    absoluteExpiresAt: nowPlus(ABSOLUTE_MS, now),
    userAgentHash: sessionUserAgentHash(userAgent),
  });
  return { token, maxAge: Math.floor(ABSOLUTE_MS / 1000) };
}

function nowPlus(milliseconds: number, now = new Date()) {
  return new Date(now.getTime() + milliseconds);
}

export async function resolveSession(
  token?: string,
) {
  return resolveSessionToken(token);
}

export async function currentUser() {
  return resolveSession((await cookies()).get(USER_SESSION_COOKIE)?.value);
}

export async function revokeSession(token?: string) {
  await revokeSessionToken(token);
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
