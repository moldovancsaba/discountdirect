"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/auth/service";
import { applyPurchaseImport, previewPurchaseImport, updateCustomerPrivacy, updatePurchaseStatus } from "@/purchases/service";

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

export async function applyPurchasesAction(sellerSlug: string, form: FormData) {
  const user = await identity();
  const batchId = String(form.get("batchId") ?? "");
  let error = "";
  try {
    await applyPurchaseImport(user.id, sellerSlug, batchId);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "INVALID";
  }
  redirect(`/seller/${sellerSlug}/customers${error ? `?batch=${encodeURIComponent(batchId)}&error=${encodeURIComponent(error)}` : "?saved=imported"}`);
}

export async function purchaseStatusAction(sellerSlug: string, customerId: string, purchaseId: string, form: FormData) {
  const user = await identity();
  let error = "";
  try {
    await updatePurchaseStatus(user.id, sellerSlug, purchaseId, Number(form.get("version")), form.get("status"), form.get("reason"));
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
