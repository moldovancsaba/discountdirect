"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { currentUser } from "@/auth/service";
import { ensureConversation, sendConversationMessage } from "@/messaging/service";

async function identity() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  return user;
}

export async function openConversationAction(sellerSlug: string, customerId: string) {
  const user = await identity();
  try {
    const conversation = await ensureConversation(user.id, sellerSlug, customerId);
    redirect(`/seller/${sellerSlug}/conversations/${conversation.id}`);
  } catch (error) {
    redirect(`/seller/${sellerSlug}/customers?customer=${customerId}&error=${encodeURIComponent(error instanceof Error ? error.message : "INVALID")}`);
  }
}

export async function sendConversationMessageAction(conversationId: string, returnTo: string, form: FormData) {
  const user = await identity();
  try {
    await sendConversationMessage(user.id, conversationId, randomUUID(), form.get("body"));
    redirect(`${returnTo}?saved=message`);
  } catch (error) {
    redirect(`${returnTo}?error=${encodeURIComponent(error instanceof Error ? error.message : "INVALID")}`);
  }
}
