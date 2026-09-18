import assert from "node:assert/strict";
import { test } from "node:test";
import { prototypeFixture } from "../src/fixtures/prototype.ts";

test("prototype acceptance buyers and pending counts stay exact", () => {
  assert.equal(prototypeFixture.seller.name, "ElektroHome Kft.");
  assert.deepEqual(prototypeFixture.buyers.map(({ name, history, pendingOffers }) => ({ name, orders: history.length, pendingOffers })), [
    { name: "Kiss Anna", orders: 9, pendingOffers: 0 },
    { name: "Szabó Gábor", orders: 7, pendingOffers: 1 },
    { name: "Nagy Réka", orders: 2, pendingOffers: 0 },
  ]);
});

test("every recommendation references a seeded catalogue product", () => {
  const skus = new Set(prototypeFixture.catalog.map(([sku]) => sku));
  for (const buyer of prototypeFixture.buyers) for (const [sku] of buyer.recommendations) assert.ok(skus.has(sku), `${buyer.key}:${sku}`);
});
