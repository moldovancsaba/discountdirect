import { test } from "node:test";
import assert from "node:assert/strict";
import { rankRecommendations } from "../src/recommendations/engine.ts";

const products = [
  { id: "b", version: 1, sku: "FILTER", name: "Szűrő", priceHuf: 4990, stock: 3, active: true, category: "Kiegészítő", compatibleWith: ["MACHINE"] },
  { id: "a", version: 1, sku: "MACHINE", name: "Gép", priceHuf: 99990, stock: 1, active: true, category: "Gép", compatibleWith: [] },
  { id: "c", version: 1, sku: "EMPTY", name: "Nincs", priceHuf: 1, stock: 0, active: true, category: "Gép", compatibleWith: ["MACHINE"] },
];

test("recommendations prefer compatibility and cite purchase evidence", () => {
  const rows = rankRecommendations(products, [{ id: "purchase-1", productSku: "MACHINE", purchasedAt: new Date("2026-08-01T00:00:00Z"), status: "purchased" }], new Date("2026-09-09T00:00:00Z"));
  assert.equal(rows[0].product.sku, "FILTER");
  assert.equal(rows[0].reasonCode, "COMPATIBLE_ACCESSORY");
  assert.deepEqual(rows[0].evidenceIds, ["purchase-1"]);
  assert.equal(rows.some((row) => row.product.sku === "EMPTY"), false);
});

test("recommendations ignore refunded evidence and use stable id tie-breaking", () => {
  assert.deepEqual(rankRecommendations(products, [{ id: "refund", productSku: "MACHINE", purchasedAt: new Date("2026-01-01T00:00:00Z"), status: "refunded" }]), []);
  const tied = rankRecommendations([{ ...products[0], id: "z", sku: "Z" }, { ...products[0], id: "a", sku: "A" }], [{ id: "p", productSku: "MACHINE", purchasedAt: new Date("2026-01-01T00:00:00Z"), status: "purchased" }]);
  assert.deepEqual(tied.map((row) => row.product.id), ["a", "z"]);
});
