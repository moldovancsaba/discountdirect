import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose documents are normalized at this boundary. */
import { BuyerRelationship, Seller } from "../auth/models";
import { connectDatabase } from "../lib/database";
import { CustomerMembership } from "./models";
import { deriveMembershipTier, MEMBERSHIP_RULE_VERSION, membershipBenefits } from "./core";

export class MembershipError extends Error { constructor(public code: "NOT_FOUND" | "FORBIDDEN" | "CONFLICT") { super(code); } }

async function context(userId: string, sellerSlug: string) {
  await connectDatabase();
  const seller = await Seller.findOne({ slug: sellerSlug, status: "active" }).lean();
  if (!seller) throw new MembershipError("NOT_FOUND");
  const relationship = await BuyerRelationship.findOne({ sellerId: seller._id, buyerUserId: userId, status: "active" }).lean();
  if (!relationship) throw new MembershipError("FORBIDDEN");
  return { seller, relationship };
}

function output(row: any) { return { id: row._id.toString(), sellerId: row.sellerId.toString(), status: row.status, tier: row.tier, benefits: membershipBenefits(row.tier), joinedAt: row.joinedAt, leftAt: row.leftAt, version: row.version, ruleVersion: row.ruleVersion }; }

export async function joinMembership(userId: string, sellerSlug: string) {
  const { seller, relationship } = await context(userId, sellerSlug);
  const tier = deriveMembershipTier(relationship.orderCount, relationship.totalHuf);
  const now = new Date();
  const row = await CustomerMembership.findOneAndUpdate({ sellerId: seller._id, buyerUserId: userId }, { $set: { status: "active", tier, leftAt: null, ruleVersion: MEMBERSHIP_RULE_VERSION }, $setOnInsert: { joinedAt: now, version: 1 } }, { upsert: true, new: true, runValidators: true });
  return output(row);
}

export async function leaveMembership(userId: string, sellerSlug: string, expectedVersion: number) {
  const { seller } = await context(userId, sellerSlug);
  const row = await CustomerMembership.findOneAndUpdate({ sellerId: seller._id, buyerUserId: userId, version: expectedVersion, status: "active" }, { $set: { status: "left", leftAt: new Date() }, $inc: { version: 1 } }, { new: true, runValidators: true });
  if (!row) throw new MembershipError("CONFLICT");
  return output(row);
}

export async function getMembership(userId: string, sellerSlug: string) {
  const { seller } = await context(userId, sellerSlug);
  const row = await CustomerMembership.findOne({ sellerId: seller._id, buyerUserId: userId }).lean();
  return row ? output(row) : { status: "not_joined", sellerId: seller._id.toString(), tier: null, benefits: membershipBenefits("member") };
}
