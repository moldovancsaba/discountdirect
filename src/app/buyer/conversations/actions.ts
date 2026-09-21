"use server";
import { redirect } from "next/navigation";
import { currentUser } from "@/auth/service";
import { saveBuyerInboxPreference } from "@/messaging/service";
export async function saveInboxModeAction(expectedVersion: number, form: FormData) { const user = await currentUser(); if (!user) redirect("/sign-in"); let target = "/buyer/conversations?saved=mode"; try { await saveBuyerInboxPreference(user.id, { mode: form.get("mode"), sellerId: form.get("sellerId") }, expectedVersion); } catch (error) { target = `/buyer/conversations?error=${encodeURIComponent(error instanceof Error ? error.message : "INVALID")}`; } redirect(target); }
