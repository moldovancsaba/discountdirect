import mongoose, { type InferSchemaType } from "mongoose";

const { Schema, model, models } = mongoose;

const timestamps = { timestamps: true, versionKey: false } as const;

const userSchema = new Schema(
  {
    emailNormalized: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    displayName: { type: String, required: true, maxlength: 120 },
    passwordHash: { type: String, default: null, select: false },
    status: {
      type: String,
      enum: ["pending", "active", "disabled"],
      default: "pending",
      index: true,
    },
    systemRole: { type: String, enum: ["operator", null], default: null },
    ssoUserId: { type: String, default: null },
    ssoRole: { type: String, default: null },
    ssoStatus: { type: String, default: null },
    lastSsoLoginAt: { type: Date, default: null },
    authVersion: { type: Number, default: 1, min: 1 },
  },
  { ...timestamps, collection: "users" },
);
userSchema.index(
  { ssoUserId: 1 },
  {
    unique: true,
    partialFilterExpression: { ssoUserId: { $type: "string" } },
  },
);

const sellerSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 160 },
    slug: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: ["active", "disabled"], default: "active" },
  },
  { ...timestamps, collection: "sellers" },
);

const membershipSchema = new Schema(
  {
    sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller" },
    userId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
    role: { type: String, enum: ["owner", "staff"], required: true },
    status: { type: String, enum: ["active", "revoked"], default: "active" },
  },
  { ...timestamps, collection: "memberships" },
);
membershipSchema.index({ sellerId: 1, userId: 1 }, { unique: true });

const buyerRelationshipSchema = new Schema(
  {
    sellerId: { type: Schema.Types.ObjectId, required: true, ref: "Seller" },
    buyerUserId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
    status: { type: String, enum: ["active", "revoked"], default: "active" },
  },
  { ...timestamps, collection: "buyer_relationships" },
);
buyerRelationshipSchema.index(
  { sellerId: 1, buyerUserId: 1 },
  { unique: true },
);

const sessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true, index: true },
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
      index: true,
    },
    authVersion: { type: Number, required: true },
    lastSeenAt: { type: Date, required: true },
    idleExpiresAt: { type: Date, required: true, index: true },
    absoluteExpiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    userAgentHash: { type: String, required: true },
  },
  { ...timestamps, collection: "sessions" },
);
sessionSchema.index({ absoluteExpiresAt: 1 }, { expireAfterSeconds: 0 });

const accessTokenSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
    purpose: { type: String, enum: ["activation", "recovery"], required: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    createdBy: { type: String, required: true, maxlength: 120 },
  },
  { ...timestamps, collection: "access_tokens" },
);
accessTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const loginRateLimitSchema = new Schema(
  {
    keyHash: { type: String, required: true, unique: true, index: true },
    attempts: { type: Number, required: true, default: 0 },
    windowStartedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    blockedUntil: { type: Date, default: null },
  },
  { timestamps: false, versionKey: false, collection: "login_rate_limits" },
);
loginRateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const authAuditEventSchema = new Schema(
  {
    actorKind: { type: String, enum: ["operator_user", "operator_token", "system"], required: true, index: true },
    actorUserId: { type: Schema.Types.ObjectId, default: null, ref: "User", index: true },
    actorLabel: { type: String, required: true, maxlength: 160 },
    action: {
      type: String,
      enum: ["user_sessions_revoked", "user_disabled", "membership_revoked", "buyer_relationship_revoked"],
      required: true,
      index: true,
    },
    targetUserId: { type: Schema.Types.ObjectId, default: null, ref: "User", index: true },
    targetMembershipId: { type: Schema.Types.ObjectId, default: null, ref: "Membership", index: true },
    targetBuyerRelationshipId: { type: Schema.Types.ObjectId, default: null, ref: "BuyerRelationship", index: true },
    reason: { type: String, required: true, maxlength: 240 },
    occurredAt: { type: Date, required: true, default: Date.now, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: "auth_audit_events" },
);
authAuditEventSchema.index({ occurredAt: -1, _id: -1 });

export type UserRecord = InferSchemaType<typeof userSchema>;
export const User = models.User || model("User", userSchema);
export const Seller = models.Seller || model("Seller", sellerSchema);
export const Membership =
  models.Membership || model("Membership", membershipSchema);
export const BuyerRelationship =
  models.BuyerRelationship ||
  model("BuyerRelationship", buyerRelationshipSchema);
export const Session = models.Session || model("Session", sessionSchema);
export const AccessToken =
  models.AccessToken || model("AccessToken", accessTokenSchema);
export const LoginRateLimit =
  models.LoginRateLimit || model("LoginRateLimit", loginRateLimitSchema);
export const AuthAuditEvent =
  models.AuthAuditEvent || model("AuthAuditEvent", authAuditEventSchema);

export const authModels = [
  User,
  Seller,
  Membership,
  BuyerRelationship,
  Session,
  AccessToken,
  LoginRateLimit,
  AuthAuditEvent,
];
