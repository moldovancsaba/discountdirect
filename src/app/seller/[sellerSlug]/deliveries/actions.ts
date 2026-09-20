"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { currentUser } from "@/auth/service";
import { transitionPostalFulfillment } from "@/postal/fulfillment";

export async function transitionPostalFulfillmentAction(sellerSlug:string,action:"mark_printed"|"mark_posted",fulfillmentId:string,version:number){const user=await currentUser();if(!user)redirect("/sign-in");let target=`/seller/${sellerSlug}/deliveries?saved=${action}`;try{await transitionPostalFulfillment(user.id,sellerSlug,{fulfillmentId,version,action,idempotencyKey:`ui:${action}:${fulfillmentId}:v${version}:${randomUUID()}`});}catch(error){target=`/seller/${sellerSlug}/deliveries?error=${encodeURIComponent(error instanceof Error?error.message:"INVALID")}`;}redirect(target);}
