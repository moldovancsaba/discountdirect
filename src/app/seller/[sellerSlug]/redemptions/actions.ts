"use server";
import { redirect } from "next/navigation";
import { currentUser } from "@/auth/service";
import { confirmRedemption } from "@/redemptions/service";

export async function confirmRedemptionAction(sellerSlug: string, form: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  let target = `/seller/${sellerSlug}/redemptions?saved=confirmed`;
  try {
    await confirmRedemption(user.id, sellerSlug, form.get("code"));
  } catch (error) {
    target = `/seller/${sellerSlug}/redemptions?error=${encodeURIComponent(error instanceof Error ? error.message : "INVALID")}`;
  }
  redirect(target);
}
