"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { currentUser } from "@/auth/service";
import { ensureConversation, sendConversationMessage } from "@/messaging/service";
import { createOffer, respondToOffer } from "@/offers/service";
import { createRecommendationPreview } from "@/recommendations/service";

async function identity() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  return user;
}

export async function openConversationAction(sellerSlug: string, customerId: string) {
  const user = await identity();
  let destination = `/seller/${sellerSlug}/customers?customer=${customerId}&error=INVALID`;
  try {
    const conversation = await ensureConversation(user.id, sellerSlug, customerId);
    destination = `/seller/${sellerSlug}/conversations/${conversation.id}`;
  } catch (error) {
    destination = `/seller/${sellerSlug}/customers?customer=${customerId}&error=${encodeURIComponent(error instanceof Error ? error.message : "INVALID")}`;
  }
  redirect(destination);
}

export async function sendConversationMessageAction(conversationId: string, returnTo: string, form: FormData) {
  const user = await identity();
  let destination = `${returnTo}?saved=message`;
  try {
    await sendConversationMessage(user.id, conversationId, randomUUID(), form.get("body"));
  } catch (error) {
    destination = `${returnTo}?error=${encodeURIComponent(error instanceof Error ? error.message : "INVALID")}`;
  }
  redirect(destination);
}

export async function respondConversationOfferAction(returnTo: string, offerId: string, version: number, decision: "accepted" | "declined") {
  const user = await identity();
  let destination = `${returnTo}?saved=offer`;
  try {
    await respondToOffer(user.id, offerId, version, decision);
  } catch (error) {
    destination = `${returnTo}?error=${encodeURIComponent(error instanceof Error ? error.message : "INVALID")}`;
  }
  redirect(destination);
}

export async function conversationRecommendationPreviewAction(returnTo: string, sellerSlug: string, customerId: string, form: FormData) {
  const user = await identity();
  let destination = `${returnTo}?error=INVALID`;
  try {
    const preview = await createRecommendationPreview(user.id, sellerSlug, customerId, form.get("channel"));
    destination = `${returnTo}?preview=${preview.id}`;
  } catch (error) {
    destination = `${returnTo}?error=${encodeURIComponent(error instanceof Error ? error.message : "INVALID")}`;
  }
  redirect(destination);
}

export async function createConversationOfferAction(returnTo: string, sellerSlug: string, previewId: string, productId: string, form: FormData) {
  const user = await identity();
  let destination = `${returnTo}?preview=${previewId}&saved=offer`;
  try {
    await createOffer(user.id, sellerSlug, { previewId, productId, discountPct: Number(form.get("discountPct")), expiresAt: form.get("expiresAt"), clientRequestId: randomUUID() });
  } catch (error) {
    destination = `${returnTo}?preview=${previewId}&error=${encodeURIComponent(error instanceof Error ? error.message : "INVALID")}`;
  }
  redirect(destination);
}
