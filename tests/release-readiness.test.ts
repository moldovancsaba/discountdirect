import { test } from "node:test";
import assert from "node:assert/strict";
import { releaseReadiness } from "../src/lib/release-readiness.ts";

test("release readiness reports each missing external prerequisite", () => {
  const result = releaseReadiness({ BLOB_READ_WRITE_TOKEN: "blob", UNAS_CONNECTOR_CREDENTIALS: "unas" });
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.prerequisites.find((item) => item.key === "blob"), { key: "blob", status: "ready", missing: [] });
  assert.deepEqual(result.prerequisites.find((item) => item.key === "redis"), { key: "redis", status: "blocked", missing: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"] });
  assert.deepEqual(result.prerequisites.find((item) => item.key === "unas"), { key: "unas", status: "ready", missing: [] });
});

test("release readiness is ready only when every integration contract is configured", () => {
  const env = {
    BLOB_READ_WRITE_TOKEN: "blob",
    UPSTASH_REDIS_REST_URL: "https://redis.example",
    UPSTASH_REDIS_REST_TOKEN: "redis",
    SHOPRENTER_CONNECTOR_CREDENTIALS: "shop",
    UNAS_CONNECTOR_CREDENTIALS: "unas",
    POSTAL_PROVIDER_ENDPOINT: "https://postal.example",
    POSTAL_PROVIDER_TOKEN: "postal",
    POSTAL_DELIVERY_PROVIDER: "http",
    POSTAL_PROVIDER_WEBHOOK_SECRET: "secretsecretsecretsecretsecretsecret",
    POSTAL_PUBLIC_BASE_URL: "https://discountdirect.example",
  };
  assert.equal(releaseReadiness(env).status, "ready");
});
