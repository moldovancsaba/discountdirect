import assert from "node:assert/strict";
import test from "node:test";
import { calculateReferencePrice, discountedPrice } from "../src/pricing/reference-price.ts";

const now = new Date("2026-09-18T12:00:00.000Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

test("reference price uses the lowest price effective in the preceding 30 days", () => {
  const evidence = calculateReferencePrice(
    { priceHuf: 12_000, version: 4, observedAt: daysAgo(2) },
    [
      { priceHuf: 15_000, version: 1, observedAt: daysAgo(60) },
      { priceHuf: 10_000, version: 2, observedAt: daysAgo(20) },
      { priceHuf: 14_000, version: 3, observedAt: daysAgo(10) },
    ],
    now,
  );
  assert.equal(evidence.referencePriceHuf, 10_000);
  assert.deepEqual(evidence.evidenceVersions, [2]);
});

test("reference price includes the price active when the window began", () => {
  const evidence = calculateReferencePrice(
    { priceHuf: 15_000, version: 2, observedAt: daysAgo(5) },
    [{ priceHuf: 11_000, version: 1, observedAt: daysAgo(45) }],
    now,
  );
  assert.equal(evidence.referencePriceHuf, 11_000);
});

test("discount calculation never starts above the current catalog price", () => {
  const evidence = calculateReferencePrice({ priceHuf: 8_000, version: 1, observedAt: daysAgo(1) }, [], now);
  assert.deepEqual(discountedPrice(8_000, evidence, 25), { discountBaseHuf: 8_000, priceHuf: 6_000 });
});
