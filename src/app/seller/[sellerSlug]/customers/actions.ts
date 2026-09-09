"use server";

import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { currentUser } from "@/auth/service";
import { applyPurchaseImport, previewPurchaseImport, updateCustomerPrivacy, updatePurchaseStatus } from "@/purchases/service";
import { createRecommendationPreview } from "@/recommendations/service";
import { createOffer } from "@/offers/service";

async function identity() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  return user;
}

export async function previewPurchasesAction(sellerSlug: string, form: FormData) {
  const user = await identity();
  let destination = `/seller/${sellerSlug}/customers?error=INVALID`;
  try {
    const batch = await previewPurchaseImport(user.id, sellerSlug, {
      schemaVersion: "1",
      sourceName: form.get("sourceName"),
      rows: JSON.parse(String(form.get("json") ?? "")),
    });
    destination = `/seller/${sellerSlug}/customers?batch=${batch._id.toString()}`;
  } catch (cause) {
    destination = `/seller/${sellerSlug}/customers?error=${encodeURIComponent(cause instanceof Error ? cause.message : "INVALID")}`;
  }
  redirect(destination);
}

export async function applyPurchasesAction(sellerSlug: string, batchId: string) {
  const user = await identity();
  let error = "";
  try {
    await applyPurchaseImport(user.id, sellerSlug, batchId);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "INVALID";
  }
  redirect(`/seller/${sellerSlug}/customers${error ? `?batch=${encodeURIComponent(batchId)}&error=${encodeURIComponent(error)}` : "?saved=imported"}`);
}

export async function purchaseStatusAction(sellerSlug: string, customerId: string, purchaseId: string, version: number, form: FormData) {
  const user = await identity();
  let error = "";
  try {
    await updatePurchaseStatus(user.id, sellerSlug, purchaseId, version, form.get("status"), form.get("reason"));
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "INVALID";
  }
  redirect(`/seller/${sellerSlug}/customers?customer=${customerId}&${error ? `error=${encodeURIComponent(error)}` : "saved=corrected"}`);
}

export async function customerPrivacyAction(sellerSlug: string, customerId: string, form: FormData) {
  const user = await identity();
  let error = "";
  try {
    await updateCustomerPrivacy(user.id, sellerSlug, customerId, form.get("status"));
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "INVALID";
  }
  redirect(`/seller/${sellerSlug}/customers?customer=${customerId}&${error ? `error=${encodeURIComponent(error)}` : "saved=privacy"}`);
}

export async function recommendationPreviewAction(sellerSlug: string, customerId: string, form: FormData) {
  const user = await identity();
  let destination = `/seller/${sellerSlug}/customers?customer=${customerId}&error=INVALID`;
  try {
    const preview = await createRecommendationPreview(user.id, sellerSlug, customerId, form.get("channel"));
    destination = `/seller/${sellerSlug}/customers?customer=${customerId}&preview=${preview.id}`;
  } catch (cause) {
    destination = `/seller/${sellerSlug}/customers?customer=${customerId}&error=${encodeURIComponent(cause instanceof Error ? cause.message : "INVALID")}`;
  }
  redirect(destination);
}

export async function createOfferAction(sellerSlug: string, customerId: string, previewId: string, form: FormData) {
  const user = await identity();
  let destination = `/seller/${sellerSlug}/customers?customer=${customerId}&preview=${previewId}&error=INVALID`;
  try {
    await createOffer(user.id, sellerSlug, { previewId, productId: form.get("productId"), discountPct: Number(form.get("discountPct")), expiresAt: form.get("expiresAt"), clientRequestId: randomUUID() });
    destination = `/seller/${sellerSlug}/customers?customer=${customerId}&preview=${previewId}&saved=offer`;
  } catch (cause) { destination = `/seller/${sellerSlug}/customers?customer=${customerId}&preview=${previewId}&error=${encodeURIComponent(cause instanceof Error ? cause.message : "INVALID")}`; }
  redirect(destination);
}
