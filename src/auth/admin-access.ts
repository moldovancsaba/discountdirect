/* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose populated refs are normalized at this boundary. */
import mongoose from "mongoose";
import { connectDatabaseCore } from "../lib/database-core.ts";
import {
  AccessToken,
  AuthAuditEvent,
  BuyerRelationship,
  Membership,
  Session,
  User,
} from "./models.ts";

type AuditAction =
  | "user_sessions_revoked"
  | "user_disabled"
  | "membership_revoked"
  | "buyer_relationship_revoked";

export type OperatorActorInput = {
  actorKind: "operator_user" | "operator_token";
  actorUserId: string | null;
  actorLabel: string;
};

export class AdminAccessError extends Error {
  code: "INVALID" | "NOT_FOUND" | "CONFLICT";

  constructor(code: "INVALID" | "NOT_FOUND" | "CONFLICT") {
    super(code);
    this.code = code;
  }
}

function reasonFrom(value: unknown) {
  if (typeof value !== "string") throw new AdminAccessError("INVALID");
  const reason = value.trim();
  if (reason.length < 8 || reason.length > 240)
    throw new AdminAccessError("INVALID");
  return reason;
}

function idFrom(value: unknown) {
  if (typeof value !== "string" || !mongoose.isValidObjectId(value))
    throw new AdminAccessError("INVALID");
  return value;
}

async function auditAuthEvent(
  session: mongoose.ClientSession,
  actor: OperatorActorInput,
  input: {
    action: AuditAction;
    reason: string;
    targetUserId?: unknown;
    targetMembershipId?: unknown;
    targetBuyerRelationshipId?: unknown;
  },
) {
  await AuthAuditEvent.create(
    [
      {
        actorKind: actor.actorKind,
        actorUserId: actor.actorUserId,
        actorLabel: actor.actorLabel,
        action: input.action,
        targetUserId: input.targetUserId ?? null,
        targetMembershipId: input.targetMembershipId ?? null,
        targetBuyerRelationshipId: input.targetBuyerRelationshipId ?? null,
        reason: input.reason,
        occurredAt: new Date(),
      },
    ],
    { session },
  );
}

async function revokeOpenSessions(
  session: mongoose.ClientSession,
  userId: unknown,
  now: Date,
) {
  await Session.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: now } },
    { session },
  );
}

export async function adminAccessOverview() {
  await connectDatabaseCore();
  const now = new Date();
  const [users, activeSessions, memberships, relationships, events] =
    await Promise.all([
      User.find({}).sort({ updatedAt: -1, _id: -1 }).limit(100).lean(),
      Session.aggregate([
        {
          $match: {
            revokedAt: null,
            idleExpiresAt: { $gt: now },
            absoluteExpiresAt: { $gt: now },
          },
        },
        {
          $group: {
            _id: "$userId",
            count: { $sum: 1 },
            lastSeenAt: { $max: "$lastSeenAt" },
          },
        },
      ]),
      Membership.find({})
        .sort({ updatedAt: -1, _id: -1 })
        .limit(100)
        .populate("sellerId", "name slug")
        .populate("userId", "emailNormalized displayName")
        .lean(),
      BuyerRelationship.find({})
        .sort({ updatedAt: -1, _id: -1 })
        .limit(100)
        .populate("sellerId", "name slug")
        .populate("buyerUserId", "emailNormalized displayName")
        .lean(),
      AuthAuditEvent.find({})
        .sort({ occurredAt: -1, _id: -1 })
        .limit(30)
        .populate("targetUserId", "emailNormalized displayName")
        .lean(),
    ]);
  const sessionsByUserId = new Map(
    activeSessions.map(
      (row: { _id: { toString(): string }; count: number; lastSeenAt: Date }) =>
        [row._id.toString(), row],
    ),
  );
  return {
    users: users.map((user: any) => {
      const session = sessionsByUserId.get(user._id.toString());
      return {
        id: user._id.toString(),
        email: user.emailNormalized,
        displayName: user.displayName,
        status: user.status,
        systemRole:
          user.systemRole ??
          (user.ssoStatus === "approved" && user.ssoRole === "admin"
            ? "operator"
            : null),
        ssoStatus: user.ssoStatus,
        authVersion: user.authVersion,
        activeSessions: session?.count ?? 0,
        lastSeenAt: session?.lastSeenAt ?? null,
      };
    }),
    memberships: memberships.map((row: any) => ({
      id: row._id.toString(),
      userId: row.userId?._id?.toString() ?? row.userId?.toString(),
      email: row.userId?.emailNormalized ?? "ismeretlen",
      displayName: row.userId?.displayName ?? "Ismeretlen felhasználó",
      sellerName: row.sellerId?.name ?? "Ismeretlen eladó",
      sellerSlug: row.sellerId?.slug ?? "",
      role: row.role,
      status: row.status,
    })),
    relationships: relationships.map((row: any) => ({
      id: row._id.toString(),
      userId: row.buyerUserId?._id?.toString() ?? row.buyerUserId?.toString(),
      email: row.buyerUserId?.emailNormalized ?? "ismeretlen",
      displayName: row.buyerUserId?.displayName ?? "Ismeretlen vásárló",
      sellerName: row.sellerId?.name ?? "Ismeretlen eladó",
      sellerSlug: row.sellerId?.slug ?? "",
      status: row.status,
    })),
    events: events.map((event: any) => ({
      id: event._id.toString(),
      occurredAt: event.occurredAt,
      actor: event.actorLabel,
      action: event.action,
      target:
        event.targetUserId?.emailNormalized ??
        event.targetMembershipId?.toString() ??
        event.targetBuyerRelationshipId?.toString() ??
        "-",
      reason: event.reason,
    })),
  };
}

export async function revokeUserSessionsByOperator(
  actor: OperatorActorInput,
  userIdValue: unknown,
  reasonValue: unknown,
) {
  const userId = idFrom(userIdValue);
  const reason = reasonFrom(reasonValue);
  const database = await connectDatabaseCore();
  const now = new Date();
  await database.connection.transaction(async (session) => {
    const user = await User.findByIdAndUpdate(
      userId,
      { $inc: { authVersion: 1 } },
      { new: true, session },
    );
    if (!user) throw new AdminAccessError("NOT_FOUND");
    await revokeOpenSessions(session, user._id, now);
    await auditAuthEvent(session, actor, {
      action: "user_sessions_revoked",
      reason,
      targetUserId: user._id,
    });
  });
}

export async function disableUserByOperator(
  actor: OperatorActorInput,
  userIdValue: unknown,
  reasonValue: unknown,
) {
  const userId = idFrom(userIdValue);
  const reason = reasonFrom(reasonValue);
  const database = await connectDatabaseCore();
  const now = new Date();
  await database.connection.transaction(async (session) => {
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { status: "disabled" }, $inc: { authVersion: 1 } },
      { new: true, session },
    );
    if (!user) throw new AdminAccessError("NOT_FOUND");
    await revokeOpenSessions(session, user._id, now);
    await AccessToken.updateMany(
      { userId: user._id, consumedAt: null, revokedAt: null },
      { $set: { revokedAt: now } },
      { session },
    );
    await auditAuthEvent(session, actor, {
      action: "user_disabled",
      reason,
      targetUserId: user._id,
    });
  });
}

export async function revokeMembershipByOperator(
  actor: OperatorActorInput,
  membershipIdValue: unknown,
  reasonValue: unknown,
) {
  const membershipId = idFrom(membershipIdValue);
  const reason = reasonFrom(reasonValue);
  const database = await connectDatabaseCore();
  const now = new Date();
  await database.connection.transaction(async (session) => {
    const membership = await Membership.findByIdAndUpdate(
      membershipId,
      { $set: { status: "revoked" } },
      { new: true, session },
    );
    if (!membership) throw new AdminAccessError("NOT_FOUND");
    await User.updateOne(
      { _id: membership.userId },
      { $inc: { authVersion: 1 } },
      { session },
    );
    await revokeOpenSessions(session, membership.userId, now);
    await auditAuthEvent(session, actor, {
      action: "membership_revoked",
      reason,
      targetUserId: membership.userId,
      targetMembershipId: membership._id,
    });
  });
}

export async function revokeBuyerRelationshipByOperator(
  actor: OperatorActorInput,
  relationshipIdValue: unknown,
  reasonValue: unknown,
) {
  const relationshipId = idFrom(relationshipIdValue);
  const reason = reasonFrom(reasonValue);
  const database = await connectDatabaseCore();
  const now = new Date();
  await database.connection.transaction(async (session) => {
    const relationship = await BuyerRelationship.findByIdAndUpdate(
      relationshipId,
      { $set: { status: "revoked" } },
      { new: true, session },
    );
    if (!relationship) throw new AdminAccessError("NOT_FOUND");
    await User.updateOne(
      { _id: relationship.buyerUserId },
      { $inc: { authVersion: 1 } },
      { session },
    );
    await revokeOpenSessions(session, relationship.buyerUserId, now);
    await auditAuthEvent(session, actor, {
      action: "buyer_relationship_revoked",
      reason,
      targetUserId: relationship.buyerUserId,
      targetBuyerRelationshipId: relationship._id,
    });
  });
}
