"use server";
import { redirect } from "next/navigation";
import { currentUser } from "@/auth/service";
import { respondToOffer } from "@/offers/service";
import { issueOfferHandoff } from "@/handoff/service";
export async function respondOfferAction(offerId: string, version: number, decision: "accepted" | "declined") { const user = await currentUser(); if (!user) redirect("/sign-in"); let suffix = "saved=offer"; try { await respondToOffer(user.id, offerId, version, decision); } catch (error) { suffix = `error=${encodeURIComponent(error instanceof Error ? error.message : "INVALID")}`; } redirect(`/buyer/offers?${suffix}`); }
export async function handoffOfferAction(offerId:string){const user=await currentUser();if(!user)redirect("/sign-in");try{const result=await issueOfferHandoff(user.id,offerId);redirect(result.redirectUrl);}catch(error){redirect(`/buyer/offers?error=${encodeURIComponent(error instanceof Error?error.message:"UNAVAILABLE")}`);}}
