"use server";
import { redirect } from "next/navigation";
import { currentUser } from "@/auth/service";
import { createAutomationPreview, runAutomationNow, scheduleAutomationPreview, sendAutomationPreviewTest, setAutomationStatus } from "@/automations/service";

async function identity() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  return user;
}

export async function previewAutomationAction(sellerSlug: string, form: FormData) {
  const user = await identity();
  let target = `/seller/${sellerSlug}/automations?error=INVALID`;
  try {
    const preview = await createAutomationPreview(user.id, sellerSlug, {
      customerId: form.get("customerId"),
      channel: form.get("channel"),
      cadence: form.get("cadence"),
      productLimit: Number(form.get("productLimit")),
      nextRunAt: form.get("nextRunAt"),
    });
    target = `/seller/${sellerSlug}/automations?preview=${preview.id}`;
  } catch (error) {
    target = `/seller/${sellerSlug}/automations?error=${encodeURIComponent(error instanceof Error ? error.message : "INVALID")}`;
  }
  redirect(target);
}

export async function scheduleAutomationAction(sellerSlug: string, previewId: string) {
  const user = await identity();
  let target = `/seller/${sellerSlug}/automations?saved=created`;
  try {
    await scheduleAutomationPreview(user.id, sellerSlug, previewId, crypto.randomUUID().replaceAll("-", ""));
  } catch (error) {
    target = `/seller/${sellerSlug}/automations?preview=${previewId}&error=${encodeURIComponent(error instanceof Error ? error.message : "INVALID")}`;
  }
  redirect(target);
}
export async function testAutomationAction(sellerSlug: string, previewId: string) { const user = await identity(); let target = `/seller/${sellerSlug}/automations?preview=${previewId}&saved=test`; try { await sendAutomationPreviewTest(user.id, sellerSlug, previewId); } catch (error) { target = `/seller/${sellerSlug}/automations?preview=${previewId}&error=${encodeURIComponent(error instanceof Error ? error.message : "INVALID")}`; } redirect(target); }

export async function runAutomationAction(sellerSlug: string, automationId: string) {
  const user = await identity();
  let target = `/seller/${sellerSlug}/automations?saved=run`;
  try {
    await runAutomationNow(user.id, sellerSlug, automationId);
  } catch (error) {
    target = `/seller/${sellerSlug}/automations?error=${encodeURIComponent(error instanceof Error ? error.message : "INVALID")}`;
  }
  redirect(target);
}

export async function automationStatusAction(sellerSlug: string, automationId: string, expectedVersion: number, status: "active" | "paused") {
  const user = await identity();
  let target = `/seller/${sellerSlug}/automations?saved=status`;
  try {
    await setAutomationStatus(user.id, sellerSlug, automationId, status, expectedVersion);
  } catch (error) {
    target = `/seller/${sellerSlug}/automations?error=${encodeURIComponent(error instanceof Error ? error.message : "INVALID")}`;
  }
  redirect(target);
}
