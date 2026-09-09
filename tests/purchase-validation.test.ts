import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePurchaseInput } from "../src/purchases/validation.ts";

const valid = { externalBuyerId: "B-1", buyerEmail: " Buyer@Example.com ", buyerName: "Teszt Vásárló", orderId: "O-1", lineId: "1", productSku: "SKU-1", productName: "Termék", purchasedAt: "2026-08-01T10:00:00.000Z", quantity: 2, totalHuf: 25980 };

test("purchase validation normalizes buyer identity and UTC date", () => {
  const row = validatePurchaseInput(valid);
  assert.equal(row.buyerEmail, "buyer@example.com");
  assert.equal(row.purchasedAt.toISOString(), "2026-08-01T10:00:00.000Z");
});

test("purchase validation rejects future, negative and fractional values", () => {
  assert.throws(() => validatePurchaseInput({ ...valid, totalHuf: -1 }), /totalHuf/);
  assert.throws(() => validatePurchaseInput({ ...valid, quantity: 1.5 }), /quantity/);
  assert.throws(() => validatePurchaseInput({ ...valid, purchasedAt: "2999-01-01T00:00:00Z" }), /purchasedAt/);
});
