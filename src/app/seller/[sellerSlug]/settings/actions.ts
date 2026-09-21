"use server";
import { redirect } from "next/navigation";
import { currentUser } from "@/auth/service";
import { getSellerSettings, revertSellerRules, updateSellerSettings } from "@/settings/service";

export async function saveSettingsAction(sellerSlug: string, expectedVersion: number, form: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  let target = `/seller/${sellerSlug}/settings?saved=updated`;
  try {
    const current = await getSellerSettings(user.id, sellerSlug);
    await updateSellerSettings(user.id, sellerSlug, {
      ...current.settings,
      inbox_mode: form.get("inboxMode"),
      discount_mode: form.get("discountMode"),
      discount_steps: String(form.get("discountSteps") ?? "").split(",").map((value) => Number(value.trim())),
      discount_guardrails: {
        ...current.settings.discount_guardrails,
        floor_pct: Number(form.get("discountFloor")),
        max_pct: Number(form.get("discountMaximum")),
        margin_floor_pct: Number(form.get("marginFloor")),
      },
      print_mode: form.get("printMode"),
      consent_scope: form.get("consentScope") ?? current.settings.consent_scope,
      frequency_cap: {
        email_per_30d: Number(form.get("emailCap")),
        chat_per_7d: Number(form.get("chatCap")),
        mailing_per_90d: Number(form.get("mailingCap")),
        rcs_per_7d: Number(form.get("rcsCap")),
      },
      holdout_pct: Number(form.get("holdoutPct")),
      reason_editable: form.get("reasonEditable") === "yes",
    }, expectedVersion, form.get("overrideMode") === "predefined" ? "predefined" : "advanced");
  } catch (error) {
    target = `/seller/${sellerSlug}/settings?error=${encodeURIComponent(error instanceof Error ? error.message : "VALIDATION")}`;
  }
  redirect(target);
}
export async function revertSettingsAction(sellerSlug: string, expectedVersion: number) { const user = await currentUser(); if (!user) redirect("/sign-in"); let target = `/seller/${sellerSlug}/settings?saved=reverted`; try { await revertSellerRules(user.id, sellerSlug, expectedVersion); } catch (error) { target = `/seller/${sellerSlug}/settings?error=${encodeURIComponent(error instanceof Error ? error.message : "VALIDATION")}`; } redirect(target); }
