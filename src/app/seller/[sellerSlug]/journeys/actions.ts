"use server";
import { redirect } from "next/navigation";
import { currentUser } from "@/auth/service";
import { enableJourney, setJourneyStatus } from "@/journeys/service";
export async function enableJourneyAction(sellerSlug: string, form: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  let target = `/seller/${sellerSlug}/journeys?saved=created`;
  try {
    const followUp = Number(form.get("followUpDelay"));
    await enableJourney(user.id, sellerSlug, {
      name: form.get("name"),
      customerId: form.get("customerId"),
      clientRequestId: crypto.randomUUID().replaceAll("-", ""),
      triggeredAt: new Date().toISOString(),
      trigger: {
        kind: form.get("triggerKind"),
        ageDays: Number(form.get("ageDays")),
        productId: form.get("productId") || undefined,
      },
      steps: [
        {
          key: "first",
          delayMinutes: Number(form.get("firstDelay")),
          channel: form.get("firstChannel"),
          title: form.get("firstTitle"),
        },
        ...(Number.isInteger(followUp) &&
        followUp >= 0 &&
        form.get("followUpTitle")
          ? [
              {
                key: "follow-up",
                delayMinutes: followUp,
                channel: form.get("followUpChannel"),
                title: form.get("followUpTitle"),
              },
            ]
          : []),
      ],
    });
  } catch (error) {
    target = `/seller/${sellerSlug}/journeys?error=${encodeURIComponent(error instanceof Error ? error.message : "INVALID")}`;
  }
  redirect(target);
}
export async function journeyStatusAction(
  sellerSlug: string,
  journeyId: string,
  expectedVersion: number,
  status: "active" | "paused",
) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  let target = `/seller/${sellerSlug}/journeys?saved=status`;
  try {
    await setJourneyStatus(
      user.id,
      sellerSlug,
      journeyId,
      status,
      expectedVersion,
    );
  } catch (error) {
    target = `/seller/${sellerSlug}/journeys?error=${encodeURIComponent(error instanceof Error ? error.message : "CONFLICT")}`;
  }
  redirect(target);
}
