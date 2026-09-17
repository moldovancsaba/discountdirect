import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blobKeys,
  blobReadiness,
  blobRetentionDays,
  privateBlobReadUrl,
} from "../src/lib/blob-core.ts";

test("blob readiness supports token and oidc modes without requiring env at build", () => {
  assert.deepEqual(blobReadiness({}), { enabled: false, authMode: null, reasonCode: "BLOB_NOT_CONFIGURED" });
  assert.deepEqual(blobReadiness({ BLOB_STORE_ID: "store_1" }), {
    enabled: false,
    authMode: null,
    reasonCode: "BLOB_CONFIGURATION_INCOMPLETE",
  });
  assert.deepEqual(blobReadiness({ BLOB_READ_WRITE_TOKEN: "blob_rw_test" }), {
    enabled: true,
    authMode: "read_write_token",
    reasonCode: null,
  });
  assert.deepEqual(blobReadiness({ VERCEL_OIDC_TOKEN: "oidc", BLOB_STORE_ID: "store_1" }), {
    enabled: true,
    authMode: "oidc",
    reasonCode: null,
  });
});

test("blob keys are seller scoped and normalize path parts", () => {
  assert.equal(
    blobKeys.sellerArtifact({ sellerId: "seller-1", kind: "letter-pdf", id: "offer:1", filename: "letter final.pdf" }),
    "seller/seller-1/artifacts/letter-pdf/offer%3A1/letter%20final.pdf",
  );
  assert.equal(blobKeys.sellerArtifactPrefix("seller/1", "privacy-export"), "seller/seller%2F1/artifacts/privacy-export/");
});

test("blob retention policy is market scoped", () => {
  assert.equal(blobRetentionDays.HU["privacy-export"], 7);
  assert.equal(blobRetentionDays.HU["letter-pdf"], 365);
  assert.equal(blobRetentionDays.HU["audit-snapshot"], 365);
});

test("private read urls are signed for get only and bounded to one day", async () => {
  const calls: unknown[] = [];
  const result = await privateBlobReadUrl("seller/seller-1/artifacts/letter-pdf/offer-1/letter.pdf", {
    env: { BLOB_READ_WRITE_TOKEN: "blob_rw_test" },
    now: new Date("2026-09-17T00:00:00Z"),
    ttlSeconds: 48 * 60 * 60,
    dependencies: {
      async issueSignedToken(input) {
        calls.push(input);
        return {
          delegationToken: "delegation",
          clientSigningToken: "client",
          validUntil: input.validUntil ?? 0,
        };
      },
      async presignUrl(signedToken, options) {
        calls.push({ signedToken, options });
        return { presignedUrl: `https://blob.example/${options.pathname}?signed=1` };
      },
    },
  });
  assert.equal(result.validUntil, new Date("2026-09-18T00:00:00Z").getTime());
  assert.equal(result.url, "https://blob.example/seller/seller-1/artifacts/letter-pdf/offer-1/letter.pdf?signed=1");
  assert.deepEqual(calls[0], {
    token: "blob_rw_test",
    pathname: "seller/seller-1/artifacts/letter-pdf/offer-1/letter.pdf",
    operations: ["get"],
    validUntil: new Date("2026-09-18T00:00:00Z").getTime(),
  });
});
