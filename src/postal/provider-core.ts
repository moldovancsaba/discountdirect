import { createHmac, timingSafeEqual } from "node:crypto";

export const providerStatuses=["submitted","printed","posted","delivered","failed"] as const;
export type ProviderStatus=typeof providerStatuses[number];
export type SubmissionStatus="queued"|"processing"|ProviderStatus|"retryable_failed"|"cancelled";
const rank:Record<Exclude<ProviderStatus,"failed">,number>={submitted:1,printed:2,posted:3,delivered:4};

export function normalizeProviderStatus(value:unknown):ProviderStatus{if(typeof value!=="string"||!providerStatuses.includes(value as ProviderStatus))throw new Error("POSTAL_PROVIDER_STATUS_INVALID");return value as ProviderStatus;}
export function mayApplyProviderStatus(current:SubmissionStatus,next:ProviderStatus){if(next==="failed")return !["delivered","cancelled"].includes(current);if(current==="failed"||current==="cancelled"||current==="delivered")return false;const currentRank=current in rank?rank[current as keyof typeof rank]:0;return rank[next]>=currentRank;}
export function retryDelayMs(attempt:number){return Math.min(60,Math.max(5,5*2**Math.max(0,attempt-1)))*60_000;}
export function verifyPostalProviderSignature(payload:string,headers:Headers,secret:string,now=Date.now()){if(secret.length<32)throw new Error("POSTAL_PROVIDER_SECRET_INVALID");const timestamp=headers.get("x-postal-timestamp")??"";const signature=headers.get("x-postal-signature")??"";const epoch=Number(timestamp);if(!Number.isFinite(epoch)||Math.abs(now-epoch*1000)>5*60_000)throw new Error("POSTAL_PROVIDER_TIMESTAMP_INVALID");const expected=createHmac("sha256",secret).update(`${timestamp}.${payload}`).digest("hex");if(signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))throw new Error("POSTAL_PROVIDER_SIGNATURE_INVALID");}
