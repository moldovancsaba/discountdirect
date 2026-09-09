import { test } from "node:test";
import assert from "node:assert/strict";
import { authorizationUrl, createOAuthFlow, safeReturnTo, sealOAuthFlow, unsealOAuthFlow } from "../src/auth/oauth-flow.ts";

test("OAuth flow matches the DoneIsBetter PKCE contract", () => {
  const flow = createOAuthFlow("/account");
  const url = authorizationUrl({ origin: "https://sso.doneisbetter.com", clientId: "client-id", redirectUri: "https://discountdirect.example/auth/callback", flow });
  assert.equal(url.pathname, "/api/oauth/authorize");
  assert.equal(url.searchParams.get("scope"), "openid profile email offline_access");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("state"), flow.state);
  assert.match(flow.verifier, /^[A-Za-z0-9_-]{43,128}$/);
});

test("OAuth flow cookie rejects changes and unsafe return paths", () => {
  const secret = "a sufficiently long test client secret";
  const flow = createOAuthFlow("/seller/example");
  const sealed = sealOAuthFlow(flow, secret);
  assert.deepEqual(unsealOAuthFlow(sealed, secret), flow);
  assert.equal(unsealOAuthFlow(`${sealed}x`, secret), null);
  assert.equal(safeReturnTo("//attacker.example"), "/account");
  assert.equal(safeReturnTo("https://attacker.example"), "/account");
});
