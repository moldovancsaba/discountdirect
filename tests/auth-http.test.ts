import { test } from "node:test";
import assert from "node:assert/strict";
import { clientAddress, isSameOrigin } from "../src/auth/http.ts";

test("same-origin check accepts the request URL origin", () => {
  const request = new Request(
    "https://discountdirect.vercel.app/api/auth/session",
    {
      headers: {
        origin: "https://discountdirect.vercel.app",
        host: "discountdirect.vercel.app",
      },
    },
  );
  assert.equal(isSameOrigin(request), true);
});

test("same-origin check rejects missing and foreign origins", () => {
  assert.equal(
    isSameOrigin(
      new Request("https://discountdirect.vercel.app/api/auth/session"),
    ),
    false,
  );
  assert.equal(
    isSameOrigin(
      new Request("https://discountdirect.vercel.app/api/auth/session", {
        headers: {
          origin: "https://evil.example",
          host: "discountdirect.vercel.app",
        },
      }),
    ),
    false,
  );
});

test("client address uses only the first forwarded value", () => {
  const request = new Request("https://example.test", {
    headers: { "x-forwarded-for": `203.0.113.8, ${"a".repeat(200)}` },
  });
  assert.equal(clientAddress(request), "203.0.113.8");
});
