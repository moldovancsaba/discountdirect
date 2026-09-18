import "server-only";
import { connectDatabase } from "@/lib/database";
import { sellerAccess } from "@/catalog/service";
import { Market, SellerSettingsModel } from "./models";
import { SELLER_SETTINGS_DEFAULTS, validateSellerSettings } from "./validation";

export class SettingsError extends Error {
  constructor(public code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "STALE") { super(code); }
}

export async function ensureHungarianMarket() {
  await connectDatabase();
  return Market.findOneAndUpdate(
    { code: "HU" },
    { $setOnInsert: { code: "HU", legalBasisByChannel: { chat: "legitimate_interest", email: "legitimate_interest", mailing: "legitimate_interest", rcs: "consent" }, retentionDays: 2555, softOptIn: true, currency: "HUF", locale: "hu-HU", referencePriceDays: 30 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
}

export async function getSellerSettings(userId: string, sellerSlug: string) {
  let access;
  try { access = await sellerAccess(userId, sellerSlug); } catch (error) {
    const code = error instanceof Error ? error.message : "FORBIDDEN";
    throw new SettingsError(code === "NOT_FOUND" ? "NOT_FOUND" : "FORBIDDEN");
  }
  const market = await ensureHungarianMarket();
  const stored = await SellerSettingsModel.findOne({ sellerId: access.seller._id }).lean();
  const settings = validateSellerSettings(stored?.settings ?? {});
  return { seller: access.seller, membership: access.membership, market, settings, version: stored?.version ?? 0 };
}

export async function updateSellerSettings(userId: string, sellerSlug: string, value: unknown, expectedVersion: unknown) {
  const current = await getSellerSettings(userId, sellerSlug);
  if (current.membership.role !== "owner") throw new SettingsError("FORBIDDEN");
  if (!Number.isInteger(expectedVersion) || Number(expectedVersion) < 0) throw new SettingsError("VALIDATION");
  let settings;
  try { settings = validateSellerSettings(value); } catch { throw new SettingsError("VALIDATION"); }
  const filter = current.version === 0
    ? { sellerId: current.seller._id, version: { $exists: false } }
    : { sellerId: current.seller._id, version: Number(expectedVersion) };
  try {
    const row = await SellerSettingsModel.findOneAndUpdate(
      filter,
      { $set: { marketCode: "HU", settings, updatedByUserId: userId }, $inc: { version: 1 } },
      { upsert: current.version === 0, new: true, runValidators: true },
    ).lean();
    if (!row) throw new SettingsError("STALE");
    return { settings: validateSellerSettings(row.settings), version: row.version };
  } catch (error: unknown) {
    if (error instanceof SettingsError) throw error;
    if ((error as { code?: number })?.code === 11000) throw new SettingsError("STALE");
    throw error;
  }
}

export function defaultSellerSettings() { return validateSellerSettings(SELLER_SETTINGS_DEFAULTS); }
