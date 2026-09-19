import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose documents are normalized at this boundary. */
import { sellerAccess } from "@/catalog/service";
import { ConnectorInstallation } from "./models";
import { connectorConfiguration, connectorProvider } from "./contracts";
import { connectorFor } from "./runtime";
import { ProviderError } from "./transport";

export class ConnectorError extends Error { constructor(public code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "STALE" | "UNAVAILABLE") { super(code); } }
function view(row: any) { return { id: row._id.toString(), provider: row.provider, status: row.status, configuration: row.configuration, cursor: row.cursor ?? null, lastSuccessAt: row.lastSuccessAt ?? null, lastErrorCode: row.lastErrorCode ?? null, version: row.version, updatedAt: row.updatedAt }; }

export async function listConnectors(userId: string, sellerSlug: string) {
  const access = await sellerAccess(userId, sellerSlug).catch(() => { throw new ConnectorError("FORBIDDEN"); });
  const rows = await ConnectorInstallation.find({ sellerId: access.seller._id }).sort({ provider: 1 }).lean();
  return { seller: access.seller, membership: access.membership, connectors: rows.map(view) };
}

export async function saveConnector(userId: string, sellerSlug: string, input: unknown) {
  const access = await sellerAccess(userId, sellerSlug).catch(() => { throw new ConnectorError("FORBIDDEN"); });
  if (access.membership.role !== "owner" || !input || typeof input !== "object") throw new ConnectorError("FORBIDDEN");
  const value = input as Record<string, unknown>; const provider = connectorProvider(value.provider);
  const configuration = connectorConfiguration(value.configuration);
  if (!provider || !configuration || (provider === "shoprenter" && !configuration.shopName) || typeof value.credentialRef !== "string" || !/^[A-Z][A-Z0-9_]{2,79}$/.test(value.credentialRef)) throw new ConnectorError("INVALID");
  const row = await ConnectorInstallation.findOneAndUpdate(
    { sellerId: access.seller._id, provider },
    { $set: { credentialRef: value.credentialRef, configuration, status: "disconnected", lastErrorCode: null, updatedByUserId: userId }, $setOnInsert: { createdByUserId: userId }, $inc: { version: 1 } },
    { upsert: true, new: true, runValidators: true },
  ).lean();
  return view(row);
}

export async function disableConnector(userId: string, sellerSlug: string, providerValue: unknown, expectedVersion: unknown) {
  const access = await sellerAccess(userId, sellerSlug).catch(() => { throw new ConnectorError("FORBIDDEN"); });
  const provider = connectorProvider(providerValue);
  if (access.membership.role !== "owner" || !provider || !Number.isInteger(expectedVersion)) throw new ConnectorError("INVALID");
  const row = await ConnectorInstallation.findOneAndUpdate({ sellerId: access.seller._id, provider, version: expectedVersion }, { $set: { status: "disabled", updatedByUserId: userId }, $inc: { version: 1 } }, { new: true }).lean();
  if (!row) throw new ConnectorError("STALE"); return view(row);
}

export async function testConnector(userId: string, sellerSlug: string, providerValue: unknown, expectedVersion: unknown) {
  const access = await sellerAccess(userId, sellerSlug).catch(() => { throw new ConnectorError("FORBIDDEN"); });
  const provider = connectorProvider(providerValue);
  if (access.membership.role !== "owner" || !provider || !Number.isInteger(expectedVersion)) throw new ConnectorError("INVALID");
  const row = await ConnectorInstallation.findOneAndUpdate({ sellerId: access.seller._id, provider, version: expectedVersion, status: { $ne: "disabled" } }, { $set: { status: "testing", lastErrorCode: null, updatedByUserId: userId }, $inc: { version: 1 } }, { new: true }).lean();
  if (!row) throw new ConnectorError("STALE");
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    await connectorFor(row.provider, row.credentialRef, row.configuration).testConnection(controller.signal);
    const healthy = await ConnectorInstallation.findOneAndUpdate({ _id: row._id, sellerId: access.seller._id, status: "testing", version: row.version }, { $set: { status: "healthy", lastSuccessAt: new Date(), lastErrorCode: null }, $inc: { version: 1 } }, { new: true }).lean();
    if (!healthy) throw new ConnectorError("STALE"); return view(healthy);
  } catch (error) {
    const code = error instanceof ProviderError ? error.code : error instanceof Error && error.name === "AbortError" ? "TIMEOUT" : "UNAVAILABLE";
    await ConnectorInstallation.updateOne({ _id: row._id, sellerId: access.seller._id, status: "testing" }, { $set: { status: code === "AUTH" || code === "CONFIGURATION" ? "action_required" : "degraded", lastErrorCode: code }, $inc: { version: 1 } });
    throw new ConnectorError("UNAVAILABLE");
  } finally { clearTimeout(timeout); }
}

export async function activeInstallation(sellerId: unknown) {
  return ConnectorInstallation.findOne({ sellerId, status: "healthy" }).lean();
}
