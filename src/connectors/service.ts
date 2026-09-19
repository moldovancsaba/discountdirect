import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose documents are normalized at this boundary. */
import { sellerAccess } from "@/catalog/service";
import { ConnectorInstallation } from "./models";
import { connectorProvider } from "./contracts";

export class ConnectorError extends Error { constructor(public code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "STALE" | "UNAVAILABLE") { super(code); } }
function view(row: any) { return { id: row._id.toString(), provider: row.provider, status: row.status, cursor: row.cursor ?? null, lastSuccessAt: row.lastSuccessAt ?? null, lastErrorCode: row.lastErrorCode ?? null, version: row.version, updatedAt: row.updatedAt }; }

export async function listConnectors(userId: string, sellerSlug: string) {
  const access = await sellerAccess(userId, sellerSlug).catch(() => { throw new ConnectorError("FORBIDDEN"); });
  const rows = await ConnectorInstallation.find({ sellerId: access.seller._id }).sort({ provider: 1 }).lean();
  return { seller: access.seller, membership: access.membership, connectors: rows.map(view) };
}

export async function saveConnector(userId: string, sellerSlug: string, input: unknown) {
  const access = await sellerAccess(userId, sellerSlug).catch(() => { throw new ConnectorError("FORBIDDEN"); });
  if (access.membership.role !== "owner" || !input || typeof input !== "object") throw new ConnectorError("FORBIDDEN");
  const value = input as Record<string, unknown>; const provider = connectorProvider(value.provider);
  if (!provider || typeof value.credentialRef !== "string" || !/^[A-Za-z0-9_:/.-]{3,240}$/.test(value.credentialRef)) throw new ConnectorError("INVALID");
  const row = await ConnectorInstallation.findOneAndUpdate(
    { sellerId: access.seller._id, provider },
    { $set: { credentialRef: value.credentialRef, status: "disconnected", lastErrorCode: null, updatedByUserId: userId }, $setOnInsert: { createdByUserId: userId }, $inc: { version: 1 } },
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

export async function activeInstallation(sellerId: unknown) {
  return ConnectorInstallation.findOne({ sellerId, status: "healthy" }).lean();
}
