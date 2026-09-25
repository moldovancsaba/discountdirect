import { randomUUID } from "node:crypto";
import {
  acquireRedisLock,
  loadRedisScripts,
  recordCampaignAcceptance,
  redisClient,
  redisReadiness,
  redisKeys,
  redisRateLimit,
  releaseRedisLock,
} from "../src/lib/redis-core.ts";

const readiness = redisReadiness();
if (!readiness.enabled) {
  console.log(JSON.stringify({ ok: false, blocked: true, reasonCode: readiness.reasonCode }));
  process.exitCode = 2;
} else {
const client = redisClient();
const suffix = randomUUID().replaceAll("-", "");
const campaignId = `verification-${suffix}`;
const buyerId = `buyer-${suffix}`;
const lockScope = `verification-${suffix}`;
const lockId = "concurrency";
const keys = [
  redisKeys.campaignAccepted(campaignId),
  redisKeys.campaignBuyerAccepted(campaignId, buyerId),
  redisKeys.rate("verification", suffix),
  redisKeys.lock(lockScope, lockId),
];

try {
  const scripts = await loadRedisScripts(client);
  const records = await Promise.all(
    Array.from({ length: 5 }, () =>
      recordCampaignAcceptance(
        campaignId,
        buyerId,
        new Date(Date.now() + 60_000),
        client,
      ),
    ),
  );
  if (records.some((row) => !row.enabled || !row.accepted))
    throw new Error("REDIS_COUNTER_DRILL_FAILED");
  const total = await client.get<number>(keys[0]);
  const buyer = await client.get<number>(keys[1]);
  if (total !== 5 || buyer !== 5) throw new Error("REDIS_COUNTER_DRIFT");

  const rate = await Promise.all(
    Array.from({ length: 3 }, () =>
      redisRateLimit("verification", suffix, 2, client),
    ),
  );
  if (rate.filter((row) => row.enabled && row.accepted).length !== 2)
    throw new Error("REDIS_RATE_LIMIT_DRILL_FAILED");

  const first = await acquireRedisLock(lockScope, lockId, "first", 60, client);
  const second = await acquireRedisLock(
    lockScope,
    lockId,
    "second",
    60,
    client,
  );
  if (!first.accepted || second.accepted)
    throw new Error("REDIS_LOCK_DRILL_FAILED");
  await releaseRedisLock(lockScope, lockId, "first", client);

  console.log(
    JSON.stringify({
      ok: true,
      scripts: Object.keys(scripts).length,
      campaignCounter: total,
      buyerCounter: buyer,
      rateAccepted: rate.filter((row) => row.enabled && row.accepted).length,
      lockContention: true,
    }),
  );
} finally {
  await Promise.all(keys.map((key) => client.del(key)));
}
}
