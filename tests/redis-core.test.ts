import { test } from "node:test";
import assert from "node:assert/strict";
import {
  campaignCounterTtlSeconds,
  acquireRedisLock,
  loadRedisScripts,
  redisKeys,
  redisLuaScripts,
  redisReadiness,
  redisTtlSeconds,
  redisRateLimit,
  recordCampaignAcceptance,
  releaseRedisLock,
  withRedisLock,
} from "../src/lib/redis-core.ts";

test("redis readiness is explicit and build-safe without secrets", () => {
  assert.deepEqual(redisReadiness({}), {
    enabled: false,
    reasonCode: "REDIS_NOT_CONFIGURED",
  });
  assert.deepEqual(
    redisReadiness({ UPSTASH_REDIS_REST_URL: "https://example.upstash.io" }),
    {
      enabled: false,
      reasonCode: "REDIS_CONFIGURATION_INCOMPLETE",
    },
  );
  assert.deepEqual(
    redisReadiness({
      UPSTASH_REDIS_REST_URL: "redis://localhost:6379",
      UPSTASH_REDIS_REST_TOKEN: "token",
    }),
    {
      enabled: false,
      reasonCode: "REDIS_URL_INVALID",
    },
  );
  assert.deepEqual(
    redisReadiness({
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "token",
    }),
    {
      enabled: true,
      reasonCode: null,
    },
  );
});

test("redis key conventions keep campaign cap lock and rate prefixes stable", () => {
  assert.equal(
    redisKeys.campaignAccepted("campaign-1"),
    "camp:campaign-1:accepted",
  );
  assert.equal(
    redisKeys.campaignBuyerAccepted("campaign-1", "buyer:one"),
    "camp:campaign-1:buyer:buyer%3Aone:accepted",
  );
  assert.equal(
    redisKeys.frequencyCap("seller-1", "buyer-1", "email"),
    "cap:seller:seller-1:buyer:buyer-1:channel:email",
  );
  assert.equal(redisKeys.lock("delivery", "row/1"), "lock:delivery:row%2F1");
  assert.equal(redisKeys.rate("webhook", "1.2.3.4"), "rate:webhook:1.2.3.4");
});

test("redis ttl policy preserves locks and campaign recovery windows", () => {
  assert.equal(redisTtlSeconds.lock, 60);
  assert.equal(redisTtlSeconds.rateLimitWindow, 60);
  assert.equal(redisTtlSeconds.frequencyCapWindow, 30 * 24 * 60 * 60);
  assert.equal(
    campaignCounterTtlSeconds(
      new Date("2026-09-18T00:00:00Z"),
      new Date("2026-09-17T00:00:00Z"),
    ),
    8 * 24 * 60 * 60,
  );
  assert.equal(
    campaignCounterTtlSeconds(
      new Date("2026-09-16T00:00:00Z"),
      new Date("2026-09-17T00:00:00Z"),
    ),
    6 * 24 * 60 * 60,
  );
  assert.equal(
    campaignCounterTtlSeconds(
      new Date("2026-09-01T00:00:00Z"),
      new Date("2026-09-17T00:00:00Z"),
    ),
    60,
  );
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
  assert.deepEqual(Object.keys(loaded).sort(), [
    "acquireLock",
    "campaignAccept",
    "campaignRecord",
    "frequencyCap",
    "rateLimit",
    "releaseLock",
  ]);
  assert.equal(seen.length, 6);
  assert.match(loaded.campaignAccept, /^sha:\d+$/);
});

test("rate limits and locks use bounded atomic primitives", async () => {
  const calls: Array<{
    script: string;
    keys: string[];
    args: Array<string | number>;
  }> = [];
  const client = {
    async eval<T>(
      script: string,
      keys: string[],
      args: Array<string | number>,
    ) {
      calls.push({ script, keys, args });
      return (
        script.includes("SET") ? [1, "acquired"] : [1, "allowed", 1]
      ) as T;
    },
  } as never;
  assert.deepEqual(await redisRateLimit("api", "seller/1", 10, client), {
    enabled: true,
    accepted: true,
    reasonCode: "allowed",
    count: 1,
  });
  assert.deepEqual(
    await acquireRedisLock("worker", "row/1", "token", 600, client),
    { enabled: true, accepted: true, reasonCode: "acquired" },
  );
  assert.equal(calls[1].args[1], 60);
});

test("lock release is token-bound", async () => {
  const client = {
    async eval() {
      return 1;
    },
  } as never;
  assert.deepEqual(await releaseRedisLock("worker", "row/1", "token", client), {
    enabled: true,
    released: true,
  });
});

test("campaign acceptance counter is expiring and Redis is non-authoritative", async () => {
  const calls: string[] = [];
  const client = {
    async eval<T>(
      script: string,
      keys: string[],
      args: Array<string | number>,
    ) {
      calls.push(`eval:${script}:${keys.join(",")}:${args.join(",")}`);
      return [1, 1] as T;
    },
  } as never;
  const result = await recordCampaignAcceptance(
    "campaign/1",
    "buyer/1",
    new Date(Date.now() + 60_000),
    client,
  );
  assert.deepEqual(result, {
    enabled: true,
    accepted: true,
    reasonCode: "recorded",
    total: 1,
    buyer: 1,
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /INCR/);
  assert.match(
    calls[0],
    /camp:campaign%2F1:accepted,camp:campaign%2F1:buyer:buyer%2F1:accepted/,
  );
});

test("cron lock skips overlap and falls back when Redis is not configured", async () => {
  let work = 0;
  const busyClient = {
    async eval<T>(script: string) {
      return (script.includes("SET") ? [0, "busy"] : 1) as T;
    },
  } as never;
  assert.deepEqual(
    await withRedisLock("cron", "journeys", async () => ++work, busyClient),
    { locked: true, result: null },
  );
  assert.equal(work, 0);
  assert.deepEqual(
    await withRedisLock("cron", "journeys", async () => ++work, undefined),
    { locked: false, result: 1 },
  );
});
