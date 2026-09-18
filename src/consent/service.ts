import "server-only";
import { BuyerRelationship, User } from "@/auth/models";
import { DeliveryOutbox } from "@/delivery/models";
import { connectDatabase } from "@/lib/database";
import { redisClient, redisKeys, redisReadiness, redisTtlSeconds } from "@/lib/redis";
import { ChannelPreference } from "@/privacy/models";
import { Customer, Purchase } from "@/purchases/models";
import { Market, SellerSettingsModel } from "@/settings/models";
import { validateSellerSettings } from "@/settings/validation";
import { decideMarketingSend, type LegalBasis, type MarketingChannel } from "./decision";

function policyChannel(channel: MarketingChannel) { return channel === "postal" ? "mailing" : channel; }

function windowFor(channel: MarketingChannel) {
  return channel === "email" ? 30 * 24 * 60 * 60 : 90 * 24 * 60 * 60;
}

export async function maySendMarketing(sellerId: string, buyerUserId: string, channel: MarketingChannel) {
  await connectDatabase();
  const [market, storedSettings, relationship, preference, user] = await Promise.all([
    Market.findOne({ code: "HU" }).lean(),
    SellerSettingsModel.findOne({ sellerId }).lean(),
    BuyerRelationship.findOne({ sellerId, buyerUserId }).lean(),
    ChannelPreference.findOne({ sellerId, buyerUserId, channel, purpose: "marketing" }).lean(),
    User.findById(buyerUserId).lean(),
  ]);
  const settings = validateSellerSettings(storedSettings?.settings ?? {});
  const customer = user ? await Customer.findOne({ sellerId, emailNormalized: user.emailNormalized }).lean() : null;
  const orderCount = customer ? await Purchase.countDocuments({ sellerId, customerId: customer._id, status: "purchased" }) : 0;
  const windowSeconds = windowFor(channel);
  const since = new Date(Date.now() - windowSeconds * 1000);
  const authoritativeCount = await DeliveryOutbox.countDocuments({ sellerId, buyerUserId, channel, status: "sent", sentAt: { $gte: since } });
  const key = redisKeys.frequencyCap(sellerId, buyerUserId, channel);
  let frequencyCount = authoritativeCount;
  if (redisReadiness().enabled) {
    try {
      const redis = redisClient();
      const cached = await redis.get<number>(key);
      if (cached === null) await redis.set(key, authoritativeCount, { ex: windowSeconds, nx: true });
      frequencyCount = Number(await redis.get<number>(key) ?? authoritativeCount);
    } catch {
      frequencyCount = authoritativeCount;
    }
  }
  const marketPolicy = market ?? { legalBasisByChannel: { email: "consent", mailing: "consent" }, softOptIn: false };
  const basis = (marketPolicy.legalBasisByChannel as Record<string, LegalBasis>)[policyChannel(channel)] ?? "consent";
  const cap = channel === "email" ? settings.frequency_cap.email_per_30d : settings.frequency_cap.mailing_per_90d;
  return decideMarketingSend({
    basis,
    softOptIn: Boolean(marketPolicy.softOptIn),
    relationshipActive: relationship?.status === "active",
    customerActive: customer?.privacyStatus === "active",
    preferenceStatus: preference?.status ?? null,
    orderCount,
    frequencyCount,
    frequencyCap: cap,
  });
}

export async function recordMarketingSend(sellerId: string, buyerUserId: string, channel: MarketingChannel) {
  if (!redisReadiness().enabled) return;
  const ttl = channel === "email" ? redisTtlSeconds.frequencyCapWindow : 90 * 24 * 60 * 60;
  try {
    const redis = redisClient();
    const key = redisKeys.frequencyCap(sellerId, buyerUserId, channel);
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, ttl);
  } catch {
    // MongoDB delivery history remains authoritative and rebuilds a missing key.
  }
}
