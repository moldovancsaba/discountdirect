export const REFERENCE_PRICE_WINDOW_DAYS = 30;

export type PriceObservation = {
  priceHuf: number;
  version: number;
  observedAt: Date;
};

export type ReferencePriceEvidence = {
  referencePriceHuf: number;
  windowStart: Date;
  calculatedAt: Date;
  evidenceVersions: number[];
};

export function calculateReferencePrice(
  current: PriceObservation,
  revisions: PriceObservation[],
  calculatedAt = new Date(),
): ReferencePriceEvidence {
  const windowStart = new Date(calculatedAt.getTime() - REFERENCE_PRICE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const valid = [current, ...revisions].filter((item) => Number.isInteger(item.priceHuf) && item.priceHuf > 0 && item.observedAt <= calculatedAt);
  if (!valid.length) throw new Error("REFERENCE_PRICE_EVIDENCE_MISSING");

  const beforeWindow = valid
    .filter((item) => item.observedAt <= windowStart)
    .sort((left, right) => right.observedAt.getTime() - left.observedAt.getTime())[0];
  const inWindow = valid.filter((item) => item.observedAt > windowStart);
  const evidence = [...(beforeWindow ? [beforeWindow] : []), ...inWindow];
  const referencePriceHuf = Math.min(...evidence.map((item) => item.priceHuf));
  const evidenceVersions = [...new Set(evidence.filter((item) => item.priceHuf === referencePriceHuf).map((item) => item.version))].sort((a, b) => a - b);
  return { referencePriceHuf, windowStart, calculatedAt, evidenceVersions };
}

export function discountedPrice(currentPriceHuf: number, evidence: ReferencePriceEvidence, discountPct: number) {
  const discountBaseHuf = Math.min(currentPriceHuf, evidence.referencePriceHuf);
  return { discountBaseHuf, priceHuf: Math.round(discountBaseHuf * (100 - discountPct) / 100) };
}
