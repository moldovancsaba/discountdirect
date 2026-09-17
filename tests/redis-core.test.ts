import { test } from "node:test";
import assert from "node:assert/strict";
import {
  campaignCounterTtlSeconds,
  loadRedisScripts,
  redisKeys,
  redisLuaScripts,
  redisReadiness,
  redisTtlSeconds,
} from "../src/lib/redis-core.ts";

test("redis readiness is explicit and build-safe without secrets", () => {
  assert.deepEqual(redisReadiness({}), { enabled: false, reasonCode: "REDIS_NOT_CONFIGURED" });
  assert.deepEqual(redisReadiness({ UPSTASH_REDIS_REST_URL: "https://example.upstash.io" }), {
    enabled: false,
    reasonCode: "REDIS_CONFIGURATION_INCOMPLETE",
  });
  assert.deepEqual(redisReadiness({ UPSTASH_REDIS_REST_URL: "redis://localhost:6379", UPSTASH_REDIS_REST_TOKEN: "token" }), {
    enabled: false,
    reasonCode: "REDIS_URL_INVALID",
  });
  assert.deepEqual(redisReadiness({ UPSTASH_REDIS_REST_URL: "https://example.upstash.io", UPSTASH_REDIS_REST_TOKEN: "token" }), {
    enabled: true,
    reasonCode: null,
  });
});

test("redis key conventions keep campaign cap lock and rate prefixes stable", () => {
  assert.equal(redisKeys.campaignAccepted("campaign-1"), "camp:campaign-1:accepted");
  assert.equal(redisKeys.campaignBuyerAccepted("campaign-1", "buyer:one"), "camp:campaign-1:buyer:buyer%3Aone:accepted");
  assert.equal(redisKeys.frequencyCap("seller-1", "buyer-1", "email"), "cap:seller:seller-1:buyer:buyer-1:channel:email");
  assert.equal(redisKeys.lock("delivery", "row/1"), "lock:delivery:row%2F1");
  assert.equal(redisKeys.rate("webhook", "1.2.3.4"), "rate:webhook:1.2.3.4");
});

test("redis ttl policy preserves locks and campaign recovery windows", () => {
  assert.equal(redisTtlSeconds.lock, 60);
  assert.equal(redisTtlSeconds.rateLimitWindow, 60);
  assert.equal(redisTtlSeconds.frequencyCapWindow, 30 * 24 * 60 * 60);
  assert.equal(
    campaignCounterTtlSeconds(new Date("2026-09-18T00:00:00Z"), new Date("2026-09-17T00:00:00Z")),
    8 * 24 * 60 * 60,
  );
  assert.equal(campaignCounterTtlSeconds(new Date("2026-09-16T00:00:00Z"), new Date("2026-09-17T00:00:00Z")), 6 * 24 * 60 * 60);
  assert.equal(campaignCounterTtlSeconds(new Date("2026-09-01T00:00:00Z"), new Date("2026-09-17T00:00:00Z")), 60);
});

test("redis lua scripts are loadable through the Upstash script command", async () => {
  assert.match(redisLuaScripts.campaignAccept, /per_buyer_limit/);
  assert.match(redisLuaScripts.frequencyCap, /frequency_cap/);
  const seen: string[] = [];
  const loaded = await loadRedisScripts({
    async scriptLoad(script: string) {
      seen.push(script);
      return `sha:${script.length}`;
    },
  });
  assert.deepEqual(Object.keys(loaded).sort(), ["campaignAccept", "frequencyCap"]);
  assert.equal(seen.length, 2);
  assert.match(loaded.campaignAccept, /^sha:\d+$/);
});
