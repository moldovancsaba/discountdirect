import { createHash } from "node:crypto";

export type HoldoutMode = "pooled" | "per_campaign";

export function holdoutBucket(input: { sellerId: string; buyerUserId: string; mode: HoldoutMode; campaignKey: string }) {
  const scope = input.mode === "pooled" ? "pool" : input.campaignKey;
  const digest = createHash("sha256").update(`${input.sellerId}:${input.buyerUserId}:${scope}`).digest();
  return digest.readUInt32BE(0) % 10_000;
}

export function isHoldout(input: { sellerId: string; buyerUserId: string; holdoutPct: number; mode: HoldoutMode; campaignKey: string }) {
  if (!Number.isInteger(input.holdoutPct) || input.holdoutPct < 0 || input.holdoutPct > 20) throw new Error("INVALID_HOLDOUT_PERCENTAGE");
  return holdoutBucket(input) < input.holdoutPct * 100;
}

export function campaignLift(input: { treatmentSize: number; treatmentConversions: number; holdoutSize: number; holdoutConversions: number }) {
  const treatmentRate = input.treatmentSize ? input.treatmentConversions / input.treatmentSize : 0;
  const holdoutRate = input.holdoutSize ? input.holdoutConversions / input.holdoutSize : null;
  const incrementalRate = holdoutRate === null ? null : treatmentRate - holdoutRate;
  return {
    ...input,
    treatmentRate,
    holdoutRate,
    incrementalRate,
    estimatedIncrementalConversions: incrementalRate === null ? null : incrementalRate * input.treatmentSize,
    comparable: input.treatmentSize >= 10 && input.holdoutSize >= 10,
  };
}
