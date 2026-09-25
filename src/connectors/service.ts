import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose documents are normalized at this boundary. */
import mongoose from "mongoose";
import { sellerAccess } from "../catalog/service.ts";
import {
  ConnectorInstallation,
  ConnectorRecord,
  ConnectorRun,
  StockObservation,
} from "./models.ts";
import { connectorConfiguration, connectorProvider } from "./contracts.ts";
import type { CommerceConnector } from "./contracts.ts";
import { connectorFor } from "./runtime.ts";
import { ProviderError } from "./transport.ts";
import {
  connectorRunKey,
  connectorSyncKind,
  normalizedSyncItem,
  retryAt,
  safeNextCursor,
  type ConnectorSyncKind,
} from "./sync-core.ts";

export class ConnectorError extends Error {
  code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "STALE" | "UNAVAILABLE";
  constructor(code: ConnectorError["code"]) {
    super(code);
    this.code = code;
  }
}
function view(row: any) {
  return {
    id: row._id.toString(),
    provider: row.provider,
    status: row.status,
    configuration: row.configuration,
    cursors: row.cursors ?? {},
    lastSuccessAt: row.lastSuccessAt ?? null,
    lastErrorCode: row.lastErrorCode ?? null,
    version: row.version,
    updatedAt: row.updatedAt,
  };
}

export async function listConnectors(userId: string, sellerSlug: string) {
  const access = await sellerAccess(userId, sellerSlug).catch(() => {
    throw new ConnectorError("FORBIDDEN");
  });
  const rows = await ConnectorInstallation.find({ sellerId: access.seller._id })
    .sort({ provider: 1 })
    .lean();
  const runs = await ConnectorRun.find({ sellerId: access.seller._id })
    .sort({ startedAt: -1 })
    .limit(20)
    .select(
      "installationId kind idempotencyKey status attempt itemCount startedAt finishedAt nextAttemptAt errorCode cursorAfter",
    )
    .lean();
  return {
    seller: access.seller,
    membership: access.membership,
    connectors: rows.map(view),
    runs: runs.map((run: any) => ({
      id: run._id.toString(),
      installationId: run.installationId.toString(),
      kind: run.kind,
      idempotencyKey: run.idempotencyKey,
      status: run.status,
      attempt: run.attempt,
      itemCount: run.itemCount,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      nextAttemptAt: run.nextAttemptAt,
      errorCode: run.errorCode,
      cursorAfter: run.cursorAfter,
    })),
  };
}

export async function saveConnector(
  userId: string,
  sellerSlug: string,
  input: unknown,
) {
  const access = await sellerAccess(userId, sellerSlug).catch(() => {
    throw new ConnectorError("FORBIDDEN");
  });
  if (access.membership.role !== "owner" || !input || typeof input !== "object")
    throw new ConnectorError("FORBIDDEN");
  const value = input as Record<string, unknown>;
  const provider = connectorProvider(value.provider);
  const configuration = connectorConfiguration(value.configuration);
  if (
    !provider ||
    !configuration ||
    (provider === "shoprenter" && !configuration.shopName) ||
    typeof value.credentialRef !== "string" ||
    !/^[A-Z][A-Z0-9_]{2,79}$/.test(value.credentialRef)
  )
    throw new ConnectorError("INVALID");
  const row = await ConnectorInstallation.findOneAndUpdate(
    { sellerId: access.seller._id, provider },
    {
      $set: {
        credentialRef: value.credentialRef,
        configuration,
        status: "disconnected",
        lastErrorCode: null,
        updatedByUserId: userId,
      },
      $setOnInsert: { createdByUserId: userId },
      $inc: { version: 1 },
    },
    { upsert: true, new: true, runValidators: true },
  ).lean();
  return view(row);
}

export async function disableConnector(
  userId: string,
  sellerSlug: string,
  providerValue: unknown,
  expectedVersion: unknown,
) {
  const access = await sellerAccess(userId, sellerSlug).catch(() => {
    throw new ConnectorError("FORBIDDEN");
  });
  const provider = connectorProvider(providerValue);
  if (
    access.membership.role !== "owner" ||
    !provider ||
    !Number.isInteger(expectedVersion)
  )
    throw new ConnectorError("INVALID");
  const row = await ConnectorInstallation.findOneAndUpdate(
    { sellerId: access.seller._id, provider, version: expectedVersion },
    {
      $set: { status: "disabled", updatedByUserId: userId },
      $inc: { version: 1 },
    },
    { new: true },
  ).lean();
  if (!row) throw new ConnectorError("STALE");
  return view(row);
}

export async function testConnector(
  userId: string,
  sellerSlug: string,
  providerValue: unknown,
  expectedVersion: unknown,
) {
  const access = await sellerAccess(userId, sellerSlug).catch(() => {
    throw new ConnectorError("FORBIDDEN");
  });
  const provider = connectorProvider(providerValue);
  if (
    access.membership.role !== "owner" ||
    !provider ||
    !Number.isInteger(expectedVersion)
  )
    throw new ConnectorError("INVALID");
  const row = await ConnectorInstallation.findOneAndUpdate(
    {
      sellerId: access.seller._id,
      provider,
      version: expectedVersion,
      status: { $ne: "disabled" },
    },
    {
      $set: { status: "testing", lastErrorCode: null, updatedByUserId: userId },
      $inc: { version: 1 },
    },
    { new: true },
  ).lean();
  if (!row) throw new ConnectorError("STALE");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    await connectorFor(
      row.provider,
      row.credentialRef,
      row.configuration,
    ).testConnection(controller.signal);
    const healthy = await ConnectorInstallation.findOneAndUpdate(
      {
        _id: row._id,
        sellerId: access.seller._id,
        status: "testing",
        version: row.version,
      },
      {
        $set: {
          status: "healthy",
          lastSuccessAt: new Date(),
          lastErrorCode: null,
        },
        $inc: { version: 1 },
      },
      { new: true },
    ).lean();
    if (!healthy) throw new ConnectorError("STALE");
    return view(healthy);
  } catch (error) {
    const code =
      error instanceof ProviderError
        ? error.code
        : error instanceof Error && error.name === "AbortError"
          ? "TIMEOUT"
          : "UNAVAILABLE";
    await ConnectorInstallation.updateOne(
      { _id: row._id, sellerId: access.seller._id, status: "testing" },
      {
        $set: {
          status:
            code === "AUTH" || code === "CONFIGURATION"
              ? "action_required"
              : "degraded",
          lastErrorCode: code,
        },
        $inc: { version: 1 },
      },
    );
    throw new ConnectorError("UNAVAILABLE");
  } finally {
    clearTimeout(timeout);
  }
}

export async function activeInstallation(sellerId: unknown) {
  return ConnectorInstallation.findOne({ sellerId, status: "healthy" }).lean();
}

async function providerPage(
  row: any,
  kind: ConnectorSyncKind,
  cursor: string | null,
  signal: AbortSignal,
  injected?: CommerceConnector,
) {
  const connector =
    injected ??
    connectorFor(row.provider, row.credentialRef, row.configuration);
  if (kind === "catalog_sync") return connector.listProducts(cursor, signal);
  if (kind === "order_sync") return connector.listOrders(cursor, signal);
  const products = await connector.listProducts(cursor, signal);
  const stocks = await connector.getStock(
    products.items.map((item) => item.sku),
    signal,
  );
  return { items: stocks, nextCursor: products.nextCursor };
}

export async function syncConnector(
  userId: string,
  sellerSlug: string,
  input: unknown,
  options?: { connector?: CommerceConnector },
) {
  const access = await sellerAccess(userId, sellerSlug).catch(() => {
    throw new ConnectorError("FORBIDDEN");
  });
  if (access.membership.role !== "owner" || !input || typeof input !== "object")
    throw new ConnectorError("FORBIDDEN");
  const value = input as Record<string, unknown>;
  const provider = connectorProvider(value.provider);
  const kind = connectorSyncKind(value.kind);
  const idempotencyKey = connectorRunKey(value.idempotencyKey);
  if (
    !provider ||
    !kind ||
    !idempotencyKey ||
    !Number.isInteger(value.expectedVersion)
  )
    throw new ConnectorError("INVALID");
  const row = await ConnectorInstallation.findOne({
    sellerId: access.seller._id,
    provider,
    status: "healthy",
    version: value.expectedVersion,
  }).lean();
  if (!row) throw new ConnectorError("STALE");
  const existing = await ConnectorRun.findOne({
    sellerId: access.seller._id,
    idempotencyKey,
  }).lean();
  if (
    existing &&
    (String(existing.installationId) !== String(row._id) ||
      existing.kind !== kind)
  )
    throw new ConnectorError("INVALID");
  if (existing?.status === "succeeded")
    return { run: existing, replayed: true };
  if (
    existing?.status === "running" &&
    existing.leaseExpiresAt &&
    existing.leaseExpiresAt > new Date()
  )
    throw new ConnectorError("STALE");
  if (
    existing?.status === "failed" ||
    existing?.attempt >= 3 ||
    (existing?.nextAttemptAt && existing.nextAttemptAt > new Date())
  )
    throw new ConnectorError("UNAVAILABLE");
  const cursor =
    (row.cursors as Record<string, string | null> | undefined)?.[kind] ?? null;
  const now = new Date();
  const run = existing
    ? await ConnectorRun.findOneAndUpdate(
        {
          _id: existing._id,
          sellerId: access.seller._id,
          attempt: { $lt: 3 },
          $or: [
            { status: "retryable_failed", nextAttemptAt: { $lte: now } },
            { status: "running", leaseExpiresAt: { $lte: now } },
          ],
        },
        {
          $set: {
            status: "running",
            startedAt: now,
            finishedAt: null,
            leaseExpiresAt: new Date(now.getTime() + 2 * 60_000),
            nextAttemptAt: null,
            errorCode: null,
            cursorBefore: cursor,
          },
          $inc: { attempt: 1 },
        },
        { new: true },
      ).lean()
    : await ConnectorRun.create({
        sellerId: access.seller._id,
        installationId: row._id,
        kind,
        idempotencyKey,
        status: "running",
        attempt: 1,
        startedAt: now,
        leaseExpiresAt: new Date(now.getTime() + 2 * 60_000),
        cursorBefore: cursor,
      });
  if (!run) throw new ConnectorError("STALE");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const page = await providerPage(
      row,
      kind,
      cursor,
      controller.signal,
      options?.connector,
    );
    if (page.items.length > 100)
      throw new ProviderError("INVALID_RESPONSE", false);
    const nextCursor = safeNextCursor(cursor, page.nextCursor);
    const items = page.items.map((item) =>
      normalizedSyncItem(kind, item, provider),
    );
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        for (const item of items) {
          await ConnectorRecord.updateOne(
            {
              sellerId: access.seller._id,
              installationId: row._id,
              kind,
              providerId: item.providerId,
            },
            {
              $set: {
                provider,
                checksum: item.checksum,
                payload: item.payload,
                sourceUpdatedAt: item.sourceUpdatedAt,
                lastRunId: run._id,
              },
            },
            { upsert: true, session, runValidators: true },
          );
          if (kind === "stock_sync") {
            const stock = item.payload as {
              providerId: string;
              sku?: string;
              quantity?: number;
              updatedAt?: Date | null;
            };
            await StockObservation.updateOne(
              {
                sellerId: access.seller._id,
                installationId: row._id,
                sku: stock.sku,
              },
              {
                $set: {
                  provider,
                  providerProductId: stock.providerId,
                  sku: stock.sku,
                  quantity: stock.quantity,
                  observedAt: stock.updatedAt ?? new Date(),
                  checksum: item.checksum,
                  lastRunId: run._id,
                },
              },
              { upsert: true, session, runValidators: true },
            );
          }
        }
        const installationUpdate = await ConnectorInstallation.updateOne(
          {
            _id: row._id,
            sellerId: access.seller._id,
            version: row.version,
            status: "healthy",
          },
          {
            $set: {
              [`cursors.${kind}`]: nextCursor,
              lastSuccessAt: new Date(),
              lastErrorCode: null,
            },
            $inc: { version: 1 },
          },
          { session },
        );
        if (installationUpdate.modifiedCount !== 1)
          throw new ConnectorError("STALE");
        const runUpdate = await ConnectorRun.updateOne(
          { _id: run._id, sellerId: access.seller._id, status: "running" },
          {
            $set: {
              status: "succeeded",
              finishedAt: new Date(),
              leaseExpiresAt: null,
              cursorAfter: nextCursor,
              itemCount: items.length,
              errorCode: null,
            },
          },
          { session },
        );
        if (runUpdate.modifiedCount !== 1) throw new ConnectorError("STALE");
      });
    } finally {
      await session.endSession();
    }
    console.info(
      JSON.stringify({
        event: "connector_sync",
        sellerId: String(access.seller._id),
        provider,
        kind,
        runId: String(run._id),
        status: "succeeded",
        itemCount: items.length,
      }),
    );
    return {
      run: {
        ...run,
        status: "succeeded",
        cursorAfter: nextCursor,
        itemCount: items.length,
      },
      replayed: false,
    };
  } catch (error) {
    const code =
      error instanceof ConnectorError
        ? "STALE"
        : error instanceof ProviderError
          ? error.code
          : error instanceof Error && error.name === "AbortError"
            ? "TIMEOUT"
            : "SYNC_FAILED";
    const retryable =
      error instanceof ProviderError ? error.retryable : code === "TIMEOUT";
    const next = retryable ? retryAt(run.attempt) : null;
    await ConnectorRun.updateOne(
      { _id: run._id, sellerId: access.seller._id, status: "running" },
      {
        $set: {
          status: next ? "retryable_failed" : "failed",
          finishedAt: new Date(),
          leaseExpiresAt: null,
          nextAttemptAt: next,
          errorCode: code,
        },
      },
    );
    if (code !== "STALE")
      await ConnectorInstallation.updateOne(
        { _id: row._id, sellerId: access.seller._id },
        {
          $set: {
            status:
              code === "AUTH" || code === "CONFIGURATION"
                ? "action_required"
                : "degraded",
            lastErrorCode: code,
          },
          $inc: { version: 1 },
        },
      );
    console.warn(
      JSON.stringify({
        event: "connector_sync",
        sellerId: String(access.seller._id),
        provider,
        kind,
        runId: String(run._id),
        status: next ? "retryable_failed" : "failed",
        errorCode: code,
      }),
    );
    throw new ConnectorError(code === "STALE" ? "STALE" : "UNAVAILABLE");
  } finally {
    clearTimeout(timeout);
  }
}
