import "server-only";
import { createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { BuyerRelationship } from "@/auth/models";
import { connectDatabase } from "@/lib/database";
import { Offer } from "@/offers/models";
import { activeInstallation } from "@/connectors/service";
import { connectorFor } from "@/connectors/runtime";
import { ProviderError } from "@/connectors/transport";
import { OfferHandoff } from "./models";
import { signHandoff, verifyHandoff } from "./core";

export class HandoffError extends Error { constructor(public code: "NOT_FOUND"|"FORBIDDEN"|"INVALID"|"CONFLICT"|"EXPIRED"|"UNAVAILABLE") { super(code); } }
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function secret() { const value=process.env.HANDOFF_SIGNING_SECRET; if (!value || value.length<32) throw new HandoffError("UNAVAILABLE"); return value; }
function publicBase() { const value=process.env.APP_URL; if (!value) throw new HandoffError("UNAVAILABLE"); return new URL(value); }

export async function issueOfferHandoff(userId:string, offerId:string) {
  if(!mongoose.isValidObjectId(offerId)) throw new HandoffError("INVALID"); await connectDatabase();
  const offer=await Offer.findOne({_id:offerId,buyerUserId:userId}).lean();
  if(!offer) throw new HandoffError("NOT_FOUND");
  if(!await BuyerRelationship.exists({sellerId:offer.sellerId,buyerUserId:userId,status:"active"})) throw new HandoffError("FORBIDDEN");
  if(offer.status!=="accepted" || offer.expiresAt<=new Date()) throw new HandoffError("CONFLICT");
  if(!await activeInstallation(offer.sellerId)) throw new HandoffError("UNAVAILABLE");
  const prior=await OfferHandoff.findOne({sellerId:offer.sellerId,offerId:offer._id,status:"issued",expiresAt:{$gt:new Date()}}).lean();
  const nonce=randomBytes(24).toString("base64url"); const now=Date.now(); const expiresAt=new Date(Math.min(offer.expiresAt.getTime(),now+15*60_000));
  const row=prior ?? (await OfferHandoff.create({sellerId:offer.sellerId,offerId:offer._id,buyerUserId:userId,priceHuf:offer.priceHuf,nonceHash:hash(nonce),expiresAt})).toObject();
  const effectiveNonce=prior ? randomBytes(24).toString("base64url") : nonce;
  if(prior) await OfferHandoff.updateOne({_id:row._id,sellerId:offer.sellerId,status:"issued"},{$set:{nonceHash:hash(effectiveNonce)},$inc:{version:1}});
  const token=signHandoff({handoffId:row._id.toString(),offerId:offer._id.toString(),sellerId:offer.sellerId.toString(),buyerUserId:userId,priceHuf:offer.priceHuf,expiresAt:expiresAt.getTime(),nonce:effectiveNonce},secret());
  const url=new URL(`/handoff/${token}`,publicBase()); return {redirectUrl:url.toString(),expiresAt};
}

export async function consumeOfferHandoff(token:string): Promise<string> {
  const claims=verifyHandoff(token,secret()); await connectDatabase();
  const now=new Date(); const staleLease=new Date(now.getTime()-2*60_000); const row=await OfferHandoff.findOneAndUpdate({_id:claims.handoffId,sellerId:claims.sellerId,offerId:claims.offerId,buyerUserId:claims.buyerUserId,priceHuf:claims.priceHuf,nonceHash:hash(claims.nonce),$or:[{status:"issued"},{status:"processing",processingStartedAt:{$lt:staleLease}}],expiresAt:{$gt:now}},{$set:{status:"processing",processingStartedAt:now,lastErrorCode:null},$inc:{version:1}},{new:true}).lean();
  if(!row) throw new HandoffError("EXPIRED");
  const installation=await activeInstallation(claims.sellerId); if(!installation){ await OfferHandoff.updateOne({_id:row._id,sellerId:claims.sellerId,status:"processing"},{$set:{status:"issued",processingStartedAt:null,lastErrorCode:"CONNECTOR_UNAVAILABLE"}}); throw new HandoffError("UNAVAILABLE"); }
  const offer=await Offer.findOne({_id:claims.offerId,sellerId:claims.sellerId,buyerUserId:claims.buyerUserId,status:"accepted"}).lean();
  if(!offer){await OfferHandoff.updateOne({_id:row._id,sellerId:claims.sellerId,status:"processing"},{$set:{status:"failed",processingStartedAt:null,lastErrorCode:"OFFER_UNAVAILABLE"}});throw new HandoffError("CONFLICT");}
  try {
    const connector=connectorFor(installation.provider,installation.credentialRef,installation.configuration);
    const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),10_000);
    try {
      const checkout=await connector.createCheckout({handoffId:row._id.toString(),offerId:offer._id.toString(),productSku:offer.productSku,quantity:1,priceHuf:claims.priceHuf,expiresAt:row.expiresAt},controller.signal);
      const updated=await OfferHandoff.updateOne({_id:row._id,sellerId:claims.sellerId,status:"processing"},{$set:{status:"consumed",processingStartedAt:null,consumedAt:new Date(),provider:installation.provider,providerReference:checkout.providerReference,checkoutUrlHash:hash(checkout.url),lastErrorCode:null},$inc:{version:1}});
      if(updated.modifiedCount!==1) throw new HandoffError("EXPIRED");
      return checkout.url;
    } finally { clearTimeout(timeout); }
  } catch(error) {
    const retryable=error instanceof ProviderError && error.retryable;
    await OfferHandoff.updateOne({_id:row._id,sellerId:claims.sellerId,status:"processing"},{$set:{status:retryable?"issued":"failed",processingStartedAt:null,lastErrorCode:error instanceof ProviderError?error.code:"CHECKOUT_FAILED"},$inc:{version:1}});
    throw new HandoffError("UNAVAILABLE");
  }
}
