import test from "node:test"; import assert from "node:assert/strict"; import { signHandoff,verifyHandoff } from "../src/handoff/core.ts";
const secret="a".repeat(32); const claims={handoffId:"h1",offerId:"o1",sellerId:"s1",buyerUserId:"b1",priceHuf:12990,expiresAt:2_000_000,nonce:"n1"};
test("handoff tokens preserve frozen claims and reject tampering",()=>{const token=signHandoff(claims,secret);assert.deepEqual(verifyHandoff(token,secret,1_000_000),claims);assert.throws(()=>verifyHandoff(`${token}x`,secret,1_000_000),/HANDOFF_INVALID/);});
test("handoff tokens expire and require a strong secret",()=>{const token=signHandoff(claims,secret);assert.throws(()=>verifyHandoff(token,secret,2_000_000),/HANDOFF_EXPIRED/);assert.throws(()=>signHandoff(claims,"short"),/HANDOFF_SECRET_WEAK/);});
