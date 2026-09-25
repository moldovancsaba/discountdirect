"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/auth/service";
import { cancelProductWatch } from "@/journeys/watch-service";

export async function cancelWatchAction(sellerSlug: string, watchId: string, version: number) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  try {
    await cancelProductWatch(user.id, sellerSlug, watchId, version);
    redirect(`/buyer/watches?saved=cancelled`);
  } catch (error) {
    redirect(`/buyer/watches?error=${encodeURIComponent(error instanceof Error ? error.message : "CONFLICT")}`);
  }
}
