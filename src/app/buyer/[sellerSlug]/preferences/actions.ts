"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/auth/service";
import { createPrivacyRequest, updateBuyerPreferences } from "@/privacy/service";

async function identity() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  return user;
}

export async function savePreferencesAction(sellerSlug: string, form: FormData) {
  const user = await identity();
  let error = "";
  try {
    await updateBuyerPreferences(user.id, sellerSlug, {
      email: form.get("email") === "yes",
      postal: form.get("postal") === "yes",
    });
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "INVALID";
  }
  redirect(`/buyer/${sellerSlug}/preferences?${error ? `error=${encodeURIComponent(error)}` : "saved=preferences"}`);
}

export async function createPrivacyRequestAction(sellerSlug: string, form: FormData) {
  const user = await identity();
  let error = "";
  try {
    await createPrivacyRequest(user.id, sellerSlug, form.get("type"));
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "INVALID";
  }
  redirect(`/buyer/${sellerSlug}/preferences?${error ? `error=${encodeURIComponent(error)}` : "saved=request"}`);
}
