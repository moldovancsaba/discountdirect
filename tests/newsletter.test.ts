import assert from "node:assert/strict";
import test from "node:test";
import { NEWSLETTER_TEMPLATE_VERSION, newsletterContentHash, newsletterItems } from "../src/automations/newsletter-core.ts";

const item = { productId: "p1", productVersion: 2, productSku: "SKU-1", productName: "Árvíztűrő tükörfúrógép", priceHuf: 12990, reasonCode: "COMPATIBLE", reasonText: "Korábbi vásárlásodhoz illik.", evidencePurchaseIds: ["purchase-1"] };
test("newsletter snapshot validation preserves Unicode product content", () => { assert.deepEqual(newsletterItems([item]), [item]); });
test("newsletter content hash is deterministic and versioned", () => {
  const input = { sellerId: "s1", buyerUserId: "b1", runId: "r1", items: [item], availableUntil: "2026-09-30T00:00:00.000Z" };
  assert.equal(newsletterContentHash(input), newsletterContentHash(input));
  assert.notEqual(newsletterContentHash(input), newsletterContentHash({ ...input, templateVersion: NEWSLETTER_TEMPLATE_VERSION + 1 }));
});
test("newsletter snapshots reject empty and malformed item sets", () => { assert.throws(() => newsletterItems([]), /INVALID_NEWSLETTER_ITEMS/); assert.throws(() => newsletterItems([{ ...item, priceHuf: 1.5 }]), /INVALID_NEWSLETTER_ITEM/); });
