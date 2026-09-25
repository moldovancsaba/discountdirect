import test from "node:test";
import assert from "node:assert/strict";
import { offerStatusLabel, offerTransition } from "../src/offers/lifecycle.ts";

test("offer lifecycle allows only role-owned transitions", () => {
  assert.deepEqual(offerTransition("pending", "accepted", "buyer", "BUYER_ACCEPTED"), { from: "pending", to: "accepted", actor: "buyer", reasonCode: "BUYER_ACCEPTED" });
  assert.deepEqual(offerTransition("accepted", "redeemed", "system", "ORDER_CONFIRMED"), { from: "accepted", to: "redeemed", actor: "system", reasonCode: "ORDER_CONFIRMED" });
  assert.equal(offerStatusLabel("sold_out"), "Elfogyott");
});

test("offer lifecycle rejects backwards and unauthorized transitions", () => {
  assert.throws(() => offerTransition("redeemed", "pending", "seller", "RESET"), /ILLEGAL_OFFER_TRANSITION/);
  assert.throws(() => offerTransition("pending", "accepted", "seller", "SELLER_ACCEPTED"), /ILLEGAL_OFFER_TRANSITION/);
  assert.throws(() => offerTransition("pending", "sold_out", "system", "bad"), /INVALID_OFFER_TRANSITION/);
});
