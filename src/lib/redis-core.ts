import { randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";

export type RedisEnvironment = {
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  [key: string]: string | undefined;
};

export type RedisReadiness =
  | { enabled: true; reasonCode: null }
  | {
      enabled: false;
      reasonCode:
        | "REDIS_NOT_CONFIGURED"
        | "REDIS_CONFIGURATION_INCOMPLETE"
        | "REDIS_URL_INVALID";
    };

export class RedisConfigurationError extends Error {
  code: Exclude<RedisReadiness["reasonCode"], null>;

  constructor(code: Exclude<RedisReadiness["reasonCode"], null>) {
    super(code);
    this.code = code;
  }
}

const safePartPattern = /^[A-Za-z0-9._-]+$/;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function redisReadiness(env: RedisEnvironment = process.env) {
  const url = clean(env.UPSTASH_REDIS_REST_URL);
  const token = clean(env.UPSTASH_REDIS_REST_TOKEN);
  if (!url && !token)
    return {
      enabled: false,
      reasonCode: "REDIS_NOT_CONFIGURED",
    } satisfies RedisReadiness;
  if (!url || !token)
    return {
      enabled: false,
      reasonCode: "REDIS_CONFIGURATION_INCOMPLETE",
    } satisfies RedisReadiness;
  if (!/^https:\/\/.+/i.test(url))
    return {
      enabled: false,
      reasonCode: "REDIS_URL_INVALID",
    } satisfies RedisReadiness;
  return { enabled: true, reasonCode: null } satisfies RedisReadiness;
}

type Cache = { key?: string; client?: Redis };
const globalRedis = globalThis as typeof globalThis & {
  discountDirectRedis?: Cache;
};
const cache = (globalRedis.discountDirectRedis ??= {});

export function redisClient(env: RedisEnvironment = process.env) {
  const readiness = redisReadiness(env);
  if (!readiness.enabled)
    throw new RedisConfigurationError(readiness.reasonCode);
  const url = clean(env.UPSTASH_REDIS_REST_URL);
  const token = clean(env.UPSTASH_REDIS_REST_TOKEN);
  const key = `${url}\n${token}`;
  if (!cache.client || cache.key !== key) {
    cache.client = new Redis({ url, token });
    cache.key = key;
  }
  return cache.client;
}

export const redisTtlSeconds = {
  lock: 60,
  rateLimitWindow: 60,
  frequencyCapWindow: 30 * 24 * 60 * 60,
  campaignCounterRecovery: 7 * 24 * 60 * 60,
} as const;

export type RedisPrimitiveClient = {
  eval<T = unknown>(
    script: string,
    keys: string[],
    args: Array<string | number>,
  ): Promise<T>;
  set(
    key: string,
    value: string,
    options?: { ex?: number; nx?: boolean },
  ): Promise<unknown>;
  del(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
};

export type RedisPrimitiveResult =
  | {
      enabled: true;
      accepted: boolean;
      reasonCode: string;
      count?: number;
      total?: number;
      buyer?: number;
    }
  | {
      enabled: false;
      accepted: boolean;
      reasonCode: "REDIS_UNAVAILABLE" | RedisReadiness["reasonCode"];
    };

function primitiveFailure(error: unknown): RedisPrimitiveResult {
  if (error instanceof RedisConfigurationError)
    return { enabled: false, accepted: false, reasonCode: error.code };
  return { enabled: false, accepted: false, reasonCode: "REDIS_UNAVAILABLE" };
}

export function campaignCounterTtlSeconds(expiresAt: Date, now = new Date()) {
  const secondsUntilExpiry = Math.ceil(
    (expiresAt.getTime() - now.getTime()) / 1000,
  );
  return Math.max(
    60,
    secondsUntilExpiry + redisTtlSeconds.campaignCounterRecovery,
  );
}

export function redisKeyPart(value: string | number) {
  const raw = String(value);
  if (safePartPattern.test(raw)) return raw;
  return encodeURIComponent(raw);
}

export const redisKeys = {
  campaignAccepted(campaignId: string) {
    return `camp:${redisKeyPart(campaignId)}:accepted`;
  },
  campaignBuyerAccepted(campaignId: string, buyerUserId: string) {
    return `camp:${redisKeyPart(campaignId)}:buyer:${redisKeyPart(buyerUserId)}:accepted`;
  },
  frequencyCap(sellerId: string, buyerUserId: string, channel: string) {
    return `cap:seller:${redisKeyPart(sellerId)}:buyer:${redisKeyPart(buyerUserId)}:channel:${redisKeyPart(channel)}`;
  },
  lock(scope: string, id: string) {
    return `lock:${redisKeyPart(scope)}:${redisKeyPart(id)}`;
  },
  rate(scope: string, id: string) {
    return `rate:${redisKeyPart(scope)}:${redisKeyPart(id)}`;
  },
} as const;

export const redisLuaScripts = {
  campaignAccept: `
local total = tonumber(redis.call("GET", KEYS[1]) or "0")
local buyer = tonumber(redis.call("GET", KEYS[2]) or "0")
local totalLimit = tonumber(ARGV[1])
local buyerLimit = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
if total >= totalLimit then
  return {0, "total_limit", total, buyer}
end
if buyer >= buyerLimit then
  return {0, "per_buyer_limit", total, buyer}
end
total = redis.call("INCR", KEYS[1])
buyer = redis.call("INCR", KEYS[2])
if total == 1 then redis.call("EXPIRE", KEYS[1], ttl) end
if buyer == 1 then redis.call("EXPIRE", KEYS[2], ttl) end
return {1, "reserved", total, buyer}
`.trim(),
  frequencyCap: `
local count = tonumber(redis.call("GET", KEYS[1]) or "0")
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
if count >= limit then
  return {0, "frequency_cap", count}
end
count = redis.call("INCR", KEYS[1])
if count == 1 then redis.call("EXPIRE", KEYS[1], ttl) end
return {1, "allowed", count}
`.trim(),
  rateLimit: `
local count = tonumber(redis.call("GET", KEYS[1]) or "0")
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
if count >= limit then return {0, "rate_limit", count} end
count = redis.call("INCR", KEYS[1])
if count == 1 then redis.call("EXPIRE", KEYS[1], ttl) end
return {1, "allowed", count}
`.trim(),
  acquireLock: `
local created = redis.call("SET", KEYS[1], ARGV[1], "NX", "EX", ARGV[2])
if created then return {1, "acquired"} end
return {0, "busy"}
`.trim(),
  releaseLock: `
if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) end
return 0
`.trim(),
} as const;

export type RedisScriptName = keyof typeof redisLuaScripts;
export type RedisScriptShaMap = Record<RedisScriptName, string>;
export type RedisScriptLoader = {
  scriptLoad(script: string): Promise<string>;
};

export async function loadRedisScripts(
  client: RedisScriptLoader = redisClient(),
) {
  const loaded = {} as RedisScriptShaMap;
  for (const [name, script] of Object.entries(redisLuaScripts) as Array<
    [RedisScriptName, string]
  >) {
    loaded[name] = await client.scriptLoad(script);
  }
  return loaded;
}

export async function redisRateLimit(
  scope: string,
  id: string,
  limit: number,
  client: RedisPrimitiveClient = redisClient(),
): Promise<RedisPrimitiveResult> {
  const boundedLimit = Math.min(Math.max(Math.floor(limit), 1), 100_000);
  try {
    const result = await client.eval<[number, string, number]>(
      redisLuaScripts.rateLimit,
      [redisKeys.rate(scope, id)],
      [boundedLimit, redisTtlSeconds.rateLimitWindow],
    );
    return {
      enabled: true,
      accepted: Number(result[0]) === 1,
      reasonCode: String(result[1]),
      count: Number(result[2]),
    };
  } catch (error) {
    return primitiveFailure(error);
  }
}

export async function recordCampaignAcceptance(
  campaignId: string,
  expiresAt: Date,
  client: RedisPrimitiveClient = redisClient(),
): Promise<RedisPrimitiveResult> {
  try {
    const total = await client.incr(redisKeys.campaignAccepted(campaignId));
    if (total === 1)
      await client.expire(
        redisKeys.campaignAccepted(campaignId),
        campaignCounterTtlSeconds(expiresAt),
      );
    return { enabled: true, accepted: true, reasonCode: "recorded", total };
  } catch (error) {
    return primitiveFailure(error);
  }
}

export async function acquireRedisLock(
  scope: string,
  id: string,
  token: string,
  ttlSeconds: number = redisTtlSeconds.lock,
  client: RedisPrimitiveClient = redisClient(),
): Promise<RedisPrimitiveResult> {
  const ttl = Math.min(
    Math.max(Math.floor(ttlSeconds), 1),
    redisTtlSeconds.lock,
  );
  try {
    const result = await client.eval<[number, string]>(
      redisLuaScripts.acquireLock,
      [redisKeys.lock(scope, id)],
      [token, ttl],
    );
    return {
      enabled: true,
      accepted: Number(result[0]) === 1,
      reasonCode: String(result[1]),
    };
  } catch (error) {
    return primitiveFailure(error);
  }
}

export async function releaseRedisLock(
  scope: string,
  id: string,
  token: string,
  client: RedisPrimitiveClient = redisClient(),
) {
  try {
    return {
      enabled: true as const,
      released:
        Number(
          await client.eval(
            redisLuaScripts.releaseLock,
            [redisKeys.lock(scope, id)],
            [token],
          ),
        ) === 1,
    };
  } catch (error) {
    const failure = primitiveFailure(error);
    return {
      enabled: false as const,
      released: false,
      reasonCode: failure.reasonCode,
    };
  }
}

export async function withRedisLock<T>(
  scope: string,
  id: string,
  work: () => Promise<T>,
  client?: RedisPrimitiveClient,
) {
  const token = randomUUID();
  let acquired = false;
  try {
    const redis = client ?? redisClient();
    const result = await acquireRedisLock(
      scope,
      id,
      token,
      redisTtlSeconds.lock,
      redis,
    );
    if (result.enabled) {
      if (!result.accepted)
        return { locked: true as const, result: null as T | null };
      acquired = true;
    }
    return { locked: false as const, result: await work() };
  } catch (error) {
    if (error instanceof RedisConfigurationError)
      return { locked: false as const, result: await work() };
    throw error;
  } finally {
    if (acquired && client) await releaseRedisLock(scope, id, token, client);
    else if (acquired) {
      try {
        await releaseRedisLock(scope, id, token);
      } catch {
        /* degraded cleanup is bounded by the lock TTL */
      }
    }
  }
}

export type RedisHealth =
  | { connected: true; latencyMs: number }
  | {
      connected: false;
      latencyMs: null;
      reasonCode: RedisReadiness["reasonCode"] | "REDIS_UNAVAILABLE";
    };

export async function redisHealth(
  env: RedisEnvironment = process.env,
): Promise<RedisHealth> {
  const readiness = redisReadiness(env);
  if (!readiness.enabled)
    return {
      connected: false,
      latencyMs: null,
      reasonCode: readiness.reasonCode,
    };
  const start = performance.now();
  try {
    await redisClient(env).ping();
    return {
      connected: true,
      latencyMs: Math.round(performance.now() - start),
    };
  } catch {
    return {
      connected: false,
      latencyMs: null,
      reasonCode: "REDIS_UNAVAILABLE",
    };
  }
}
