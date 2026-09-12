import mongoose from "mongoose";
import { BuyerRelationship, Membership } from "../auth/models.ts";
import { connectDatabaseCore } from "../lib/database-core.ts";
import { Conversation } from "./models.ts";
import { MessagingError } from "./errors.ts";

export async function participant(userId: string, conversationId: string) {
  if (!mongoose.isValidObjectId(conversationId))
    throw new MessagingError("INVALID");
  await connectDatabaseCore();
  const conversation = await Conversation.findById(conversationId).lean();
  if (!conversation) throw new MessagingError("NOT_FOUND");
  const sellerMember = await Membership.exists({
    sellerId: conversation.sellerId,
    userId,
    status: "active",
  });
  if (sellerMember) return { conversation, role: "seller" as const };
  if (conversation.buyerUserId.toString() !== userId)
    throw new MessagingError("FORBIDDEN");
  if (
    !(await BuyerRelationship.exists({
      sellerId: conversation.sellerId,
      buyerUserId: userId,
      status: "active",
    }))
  )
    throw new MessagingError("FORBIDDEN");
  return { conversation, role: "buyer" as const };
}
