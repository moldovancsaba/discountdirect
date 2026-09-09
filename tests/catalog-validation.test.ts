import { test } from "node:test";
import assert from "node:assert/strict";
import { validateProductInput } from "../src/catalog/validation.ts";

const valid = { sku: "SKU-1", name: "Teszt termék", priceHuf: 12990, stock: 5, category: "Teszt", compatibleWith: ["A", "A"] };

test("catalog validation normalizes SKU and compatibility", () => {
  const result = validateProductInput(valid);
  assert.equal(result.skuNormalized, "SKU-1");
  assert.deepEqual(result.compatibleWith, ["A"]);
  assert.equal(result.active, true);
});

test("catalog validation rejects negative, fractional and malformed values", () => {
  assert.throws(() => validateProductInput({ ...valid, priceHuf: -1 }), /priceHuf/);
  assert.throws(() => validateProductInput({ ...valid, stock: 1.5 }), /stock/);
  assert.throws(() => validateProductInput({ ...valid, sku: "space sku" }), /sku/);
});
