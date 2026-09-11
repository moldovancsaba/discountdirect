"use server";
import { redirect } from "next/navigation";
import { currentUser } from "@/auth/service";
import { cancelCampaign, createFlashCampaign } from "@/campaigns/service";
async function identity() { const user = await currentUser(); if (!user) redirect("/sign-in"); return user; }
export async function createFlashCampaignAction(sellerSlug: string, form: FormData) { const user = await identity(); let target = `/seller/${sellerSlug}/campaigns?saved=created`; try { await createFlashCampaign(user.id, sellerSlug, { productId: form.get("productId"), discountPct: Number(form.get("discountPct")), quantity: Number(form.get("quantity")), expiresAt: form.get("expiresAt"), channel: form.get("channel"), clientRequestId: crypto.randomUUID().replaceAll("-", "") }); } catch (error) { target = `/seller/${sellerSlug}/campaigns?error=${encodeURIComponent(error instanceof Error ? error.message : "INVALID")}`; } redirect(target); }
export async function cancelCampaignAction(sellerSlug: string, campaignId: string) { const user = await identity(); let target = `/seller/${sellerSlug}/campaigns?saved=cancelled`; try { await cancelCampaign(user.id, sellerSlug, campaignId); } catch (error) { target = `/seller/${sellerSlug}/campaigns?error=${encodeURIComponent(error instanceof Error ? error.message : "INVALID")}`; } redirect(target); }
