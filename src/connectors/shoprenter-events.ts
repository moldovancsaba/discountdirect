import "server-only";
import mongoose from "mongoose";
import { Seller } from "../auth/models.ts";
import { connectDatabase } from "../lib/database.ts";
import { withTenantBypass } from "../lib/tenant-core.ts";
import {
  ConnectorInstallation,
  ConnectorRecord,
  ConnectorRun,
  ConnectorWebhookEvent,
} from "./models.ts";
import {
  ShoprenterWebhookError,
  verifyShoprenterCallback,
} from "./shoprenter-webhook.ts";

export async function handleShoprenterEvent(
  sellerSlug: string,
  raw: string,
  secret: string | null,
) {
  if (!/^[a-z0-9-]{2,80}$/.test(sellerSlug))
    throw new ShoprenterWebhookError("INVALID");
  const database = await connectDatabase();
  const context = await withTenantBypass(
    "shoprenter-webhook-installation-lookup",
    async () => {
      const seller = await Seller.findOne({
        slug: sellerSlug,
        status: "active",
      }).lean();
      if (!seller) return null;
      const installation = await ConnectorInstallation.findOne({
        sellerId: seller._id,
        provider: "shoprenter",
        status: "healthy",
      }).lean();
      return installation ? { seller, installation } : null;
    },
  );
  if (!context?.installation.configuration.shopName)
    throw new ShoprenterWebhookError("UNAUTHORIZED");
  const verified = verifyShoprenterCallback(
    raw,
    secret,
    context.installation.configuration.shopName,
  );
  let duplicate = false;
  await withTenantBypass("shoprenter-webhook-ingest", () =>
    database.connection.transaction(async (session) => {
      const existing = await ConnectorWebhookEvent.findOne({
        sellerId: context.seller._id,
        provider: "shoprenter",
        payloadHash: verified.payloadHash,
      })
        .session(session)
        .lean();
      if (existing) {
        duplicate = true;
        return;
      }
      const [run] = await ConnectorRun.create(
        [
          {
            sellerId: context.seller._id,
            installationId: context.installation._id,
            kind: "order_sync",
            idempotencyKey: `shoprenter:webhook:${verified.payloadHash}`,
            status: "succeeded",
            attempt: 1,
            startedAt: new Date(),
            finishedAt: new Date(),
            itemCount: 1,
          },
        ],
        { session },
      );
      await ConnectorRecord.updateOne(
        {
          sellerId: context.seller._id,
          installationId: context.installation._id,
          kind: "order_sync",
          providerId: verified.providerId,
        },
        {
          $set: {
            provider: "shoprenter",
            checksum: verified.canonical.checksum,
            payload: verified.canonical.payload,
            reconciliationState:
              verified.canonical.payload.reconciliation?.state ?? null,
            reconciliationReasonCode:
              verified.canonical.payload.reconciliation?.reasonCode ?? null,
            matchedOfferId:
              verified.canonical.payload.reconciliation?.matchedOfferId ?? null,
            reconciliationKey:
              verified.canonical.payload.reconciliation?.idempotencyKey ?? null,
            sourceUpdatedAt: verified.canonical.sourceUpdatedAt,
            lastRunId: run._id,
          },
        },
        { upsert: true, session, runValidators: true },
      );
      await ConnectorWebhookEvent.create(
        [
          {
            sellerId: context.seller._id,
            installationId: context.installation._id,
            provider: "shoprenter",
            event: verified.event,
            payloadHash: verified.payloadHash,
            providerOrderId: verified.providerId,
            status: "processed",
            receivedAt: new Date(),
          },
        ],
        { session },
      );
    }),
  );
  console.info(
    JSON.stringify({
      event: "shoprenter_webhook",
      sellerId: String(context.seller._id),
      providerOrderId: verified.providerId,
      duplicate,
      status: "processed",
    }),
  );
  return { accepted: true, duplicate };
}

export function shoprenterEventStatus(error: unknown) {
  if (!(error instanceof ShoprenterWebhookError)) return 503;
  if (error.code === "UNAUTHORIZED" || error.code === "SHOP_MISMATCH")
    return 401;
  if (error.code === "CONFIGURATION") return 503;
  return 400;
}

export function shoprenterWebhookIndexes() {
  return [
    ConnectorWebhookEvent,
    ConnectorRun,
    ConnectorRecord,
  ] satisfies mongoose.Model<unknown>[];
}
