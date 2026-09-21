import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose documents and duplicate-key errors are normalized at this boundary. */
import { connectDatabase } from "@/lib/database";
import { createHash } from "node:crypto";
import { sellerAccess } from "@/catalog/service";
import { Market, RuleResolutionEvent, RuleTemplate, RuleTemplateVersion, SellerSettingsModel } from "./models";
import { SELLER_SETTINGS_DEFAULTS, validateSellerSettings } from "./validation";
import { DEFAULT_TEMPLATE_KEY, LEGAL_LOCKS, resolveEffectiveRules, ruleDiff, type OverrideMode } from "./rules-core";

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
  await ensureDefaultRuleTemplate(userId);
  const template = await activeRuleTemplate(DEFAULT_TEMPLATE_KEY);
  const stored = await SellerSettingsModel.findOne({ sellerId: access.seller._id }).lean();
  const hasRuleMetadata = Boolean(stored?.templateKey && stored?.templateVersion);
  const overrideMode = (hasRuleMetadata ? stored?.overrideMode : stored ? "advanced" : "predefined") as OverrideMode;
  const overrideValues = hasRuleMetadata ? stored?.overrideValues : stored?.settings ?? {};
  const resolution = resolveEffectiveRules({ templateValues: template.values, overrideMode, overrideValues });
  return { seller: access.seller, membership: access.membership, market, settings: resolution.resolved, version: stored?.version ?? 0, rules: { templateKey: DEFAULT_TEMPLATE_KEY, templateVersion: template.version, overrideMode, legalLocks: resolution.legalLocks, changedPaths: ruleDiff(validateSellerSettings(template.values), resolution.resolved), clamped: resolution.clamped } };
}

async function ensureDefaultRuleTemplate(actorUserId: string) { const now = new Date(); try { await RuleTemplateVersion.create({ templateKey: DEFAULT_TEMPLATE_KEY, version: 1, values: validateSellerSettings(SELLER_SETTINGS_DEFAULTS), legalLocks: [...LEGAL_LOCKS], status: "published", publishedByUserId: actorUserId, publishedAt: now }); } catch (error: any) { if (error?.code !== 11000) throw error; } await RuleTemplate.findOneAndUpdate({ key: DEFAULT_TEMPLATE_KEY }, { $setOnInsert: { key: DEFAULT_TEMPLATE_KEY, area: "commerce", name: "Magyar kereskedelmi alapbeállítás", status: "active", activeVersion: 1, updatedByUserId: actorUserId } }, { upsert: true }); }
async function activeRuleTemplate(key: string) { const template = await RuleTemplate.findOne({ key, status: "active" }).lean(); if (!template) throw new SettingsError("NOT_FOUND"); const version = await RuleTemplateVersion.findOne({ templateKey: key, version: template.activeVersion, status: "published" }).lean(); if (!version) throw new SettingsError("NOT_FOUND"); return version; }

export async function updateSellerSettings(userId: string, sellerSlug: string, value: unknown, expectedVersion: unknown, overrideMode: OverrideMode = "advanced") {
  const current = await getSellerSettings(userId, sellerSlug);
  if (current.membership.role !== "owner") throw new SettingsError("FORBIDDEN");
  if (!Number.isInteger(expectedVersion) || Number(expectedVersion) < 0) throw new SettingsError("VALIDATION");
  const template = await activeRuleTemplate(DEFAULT_TEMPLATE_KEY); let settings;
  try { settings = resolveEffectiveRules({ templateValues: template.values, overrideMode, overrideValues: value }); } catch { throw new SettingsError("VALIDATION"); }
  const filter = current.version === 0
    ? { sellerId: current.seller._id, version: { $exists: false } }
    : { sellerId: current.seller._id, version: Number(expectedVersion) };
  try {
    const database = await connectDatabase(); let row: any;
    await database.connection.transaction(async (session) => { row = await SellerSettingsModel.findOneAndUpdate(filter, { $set: { marketCode: "HU", settings: settings.resolved, templateKey: DEFAULT_TEMPLATE_KEY, templateVersion: template.version, overrideMode, overrideValues: overrideMode === "advanced" ? value : {}, legalLocks: settings.legalLocks, updatedByUserId: userId }, $inc: { version: 1 } }, { upsert: current.version === 0, new: true, runValidators: true, session }); if (!row) throw new SettingsError("STALE"); const resolvedHash = createHash("sha256").update(JSON.stringify(settings.resolved)).digest("hex"); await RuleResolutionEvent.create([{ sellerId: current.seller._id, templateKey: DEFAULT_TEMPLATE_KEY, templateVersion: template.version, overrideVersion: row.version, overrideMode, legalLocks: settings.legalLocks, changedPaths: ruleDiff(validateSellerSettings(template.values), settings.resolved), resolvedHash, actorUserId: userId, occurredAt: new Date() }], { session }); });
    if (!row) throw new SettingsError("STALE");
    return { settings: validateSellerSettings(row.settings), version: row.version, rules: { templateKey: DEFAULT_TEMPLATE_KEY, templateVersion: template.version, overrideMode, legalLocks: settings.legalLocks, clamped: settings.clamped } };
  } catch (error: unknown) {
    if (error instanceof SettingsError) throw error;
    if ((error as { code?: number })?.code === 11000) throw new SettingsError("STALE");
    throw error;
  }
}

export async function revertSellerRules(userId: string, sellerSlug: string, expectedVersion: number) { return updateSellerSettings(userId, sellerSlug, {}, expectedVersion, "predefined"); }

export async function previewSellerRules(userId: string, sellerSlug: string, value: unknown, overrideMode: OverrideMode) {
  const current = await getSellerSettings(userId, sellerSlug);
  if (current.membership.role !== "owner") throw new SettingsError("FORBIDDEN");
  const template = await activeRuleTemplate(DEFAULT_TEMPLATE_KEY);
  try {
    const resolution = resolveEffectiveRules({ templateValues: template.values, overrideMode, overrideValues: value });
    return { settings: resolution.resolved, rules: { templateKey: DEFAULT_TEMPLATE_KEY, templateVersion: template.version, overrideMode, legalLocks: resolution.legalLocks, changedPaths: ruleDiff(validateSellerSettings(template.values), resolution.resolved), clamped: resolution.clamped } };
  } catch { throw new SettingsError("VALIDATION"); }
}

export function defaultSellerSettings() { return validateSellerSettings(SELLER_SETTINGS_DEFAULTS); }

export async function publishRuleTemplateVersion(actorUserId: string, input: unknown) { await connectDatabase(); if (!input || typeof input !== "object") throw new SettingsError("VALIDATION"); const value = input as Record<string, unknown>; const key = typeof value.key === "string" && /^[a-z0-9-]{3,80}$/.test(value.key) ? value.key : DEFAULT_TEMPLATE_KEY; let settings; try { settings = validateSellerSettings(value.values); } catch { throw new SettingsError("VALIDATION"); } const database = await connectDatabase(); let result: any; await database.connection.transaction(async (session) => { const latest = await RuleTemplateVersion.findOne({ templateKey: key }).sort({ version: -1 }).session(session).lean(); const version = (latest?.version ?? 0) + 1; await RuleTemplateVersion.create([{ templateKey: key, version, values: settings, legalLocks: [...LEGAL_LOCKS], status: "published", publishedByUserId: actorUserId, publishedAt: new Date() }], { session }); const row = await RuleTemplate.findOneAndUpdate({ key }, { $set: { area: "commerce", name: typeof value.name === "string" ? value.name.slice(0, 160) : "Kereskedelmi szabálysablon", status: "active", activeVersion: version, updatedByUserId: actorUserId } }, { upsert: true, new: true, session }); result = { key: row!.key, activeVersion: version, status: row!.status }; }); return result; }

export async function retireRuleTemplateVersion(actorUserId: string, key: string, version: unknown) { if (!Number.isInteger(version) || Number(version) < 1) throw new SettingsError("VALIDATION"); await connectDatabase(); const template = await RuleTemplate.findOne({ key }).lean(); if (!template) throw new SettingsError("NOT_FOUND"); if (template.activeVersion === Number(version)) throw new SettingsError("STALE"); const row = await RuleTemplateVersion.findOneAndUpdate({ templateKey: key, version: Number(version), status: "published" }, { $set: { status: "retired", retiredByUserId: actorUserId, retiredAt: new Date() } }, { new: true }); if (!row) throw new SettingsError("NOT_FOUND"); return { key, version: row.version, status: row.status }; }

export async function listRuleTemplates() { await connectDatabase(); const templates = await RuleTemplate.find({}).sort({ key: 1 }).lean(); return Promise.all(templates.map(async (template) => ({ key: template.key, name: template.name, area: template.area, status: template.status, activeVersion: template.activeVersion, versions: await RuleTemplateVersion.find({ templateKey: template.key }).sort({ version: -1 }).select({ version: 1, status: 1, publishedAt: 1, legalLocks: 1 }).lean() }))); }
