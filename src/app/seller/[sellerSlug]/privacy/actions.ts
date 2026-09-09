"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/auth/service";
import { advancePrivacyRequest } from "@/privacy/service";

export async function advancePrivacyRequestAction(sellerSlug: string, requestId: string, form: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  let error = "";
  try {
    await advancePrivacyRequest(user.id, sellerSlug, requestId, form.get("status"), form.get("resolution"));
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "INVALID";
  }
  redirect(`/seller/${sellerSlug}/privacy?${error ? `error=${encodeURIComponent(error)}` : "saved=request"}`);
}
