import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose records are normalized at this service boundary. */
import mongoose from "mongoose";
import { BuyerRelationship, Membership, Seller, User } from "@/auth/models";
import { Customer } from "@/purchases/models";
import { Purchase } from "@/purchases/models";
import { connectDatabase } from "@/lib/database";
import { withTenantBypass } from "@/lib/tenant";
import {
  cancelJourneyDeliveries,
  createDeliveryRecord,
} from "@/delivery/service";
import { DeliveryOutbox } from "@/delivery/models";
import { getSellerSettings } from "@/settings/service";
import { DEFAULT_TEMPLATE_KEY } from "@/settings/rules-core";
import {
  evidenceHash,
  retryAt,
  scheduledAt,
  validateJourneyConfig,
} from "./core";
import {
  backInStockTrigger,
  birthdayTrigger,
  priceDropTrigger,
} from "./triggers";
import {
  JourneyDefinition,
  JourneyDefinitionVersion,
  JourneyEnrollment,
  JourneyStepRun,
} from "./models";

export class JourneyError extends Error {
  constructor(public code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT") {
    super(code);
  }
}

async function sellerAccess(userId: string, sellerSlug: string) {
  await connectDatabase();
  const seller = await Seller.findOne({
    slug: sellerSlug,
    status: "active",
  }).lean();
  if (!seller) throw new JourneyError("NOT_FOUND");
  const membership = await Membership.findOne({
    sellerId: seller._id,
    userId,
    status: "active",
  }).lean();
  if (!membership) throw new JourneyError("FORBIDDEN");
  return { seller, membership };
}
async function customerBuyer(sellerId: unknown, customerId: unknown) {
  if (!mongoose.isValidObjectId(customerId)) throw new JourneyError("INVALID");
  const customer = await Customer.findOne({
    _id: customerId,
    sellerId,
    privacyStatus: "active",
  }).lean();
  if (!customer?.emailNormalized) throw new JourneyError("NOT_FOUND");
  const buyer = await User.findOne({
    emailNormalized: customer.emailNormalized,
    status: "active",
  }).lean();
  if (
    !buyer ||
    !(await BuyerRelationship.exists({
      sellerId,
      buyerUserId: buyer._id,
      status: "active",
    }))
  )
    throw new JourneyError("FORBIDDEN");
  return { customer, buyer };
}
function input(value: unknown) {
  if (!value || typeof value !== "object") throw new JourneyError("INVALID");
  const body = value as Record<string, unknown>;
  let config;
  try {
    config = validateJourneyConfig(body);
  } catch {
    throw new JourneyError("INVALID");
  }
  if (
    !mongoose.isValidObjectId(body.customerId) ||
    typeof body.clientRequestId !== "string" ||
    !/^[A-Za-z0-9_-]{8,120}$/.test(body.clientRequestId)
  )
    throw new JourneyError("INVALID");
  const triggeredAt =
    typeof body.triggeredAt === "string"
      ? new Date(body.triggeredAt)
      : new Date();
  if (
    !Number.isFinite(triggeredAt.getTime()) ||
    triggeredAt.getTime() > Date.now() + 300_000
  )
    throw new JourneyError("INVALID");
  return {
    config,
    customerId: String(body.customerId),
    clientRequestId: body.clientRequestId,
    triggeredAt,
  };
}

async function triggerEvidence(
  sellerId: unknown,
  customer: { _id: unknown; privacyStatus: string; birthDate?: Date | null },
  config: ReturnType<typeof validateJourneyConfig>,
  requestedAt: Date,
) {
  const customerId = customer._id;
  if (config.trigger.kind === "manual")
    return {
      triggeredAt: requestedAt,
      evidence: {
        kind: "manual",
        customerId: String(customerId),
        triggeredAt: requestedAt.toISOString(),
      },
    };
  if (config.trigger.kind === "birthday") {
    const birthday =
      customer.birthDate ??
      (config.trigger.birthday
        ? new Date(`${config.trigger.birthday}T00:00:00.000Z`)
        : null);
    const result = birthdayTrigger(birthday, requestedAt);
    if (!result.eligible)
      throw new JourneyError(
        result.reasonCode === "MISSING_DATA" ? "INVALID" : "CONFLICT",
      );
    return {
      triggeredAt: requestedAt,
      evidence: {
        ...result.evidence,
        source: customer.birthDate ? "customer_profile" : "legacy_definition",
      },
    };
  }
  if (config.trigger.kind === "back_in_stock") {
    const privacy =
      customer.privacyStatus === "erasure_requested"
        ? "erased"
        : customer.privacyStatus === "active"
          ? "active"
          : "restricted";
    const result = backInStockTrigger(
      config.trigger.previousStock ?? 0,
      config.trigger.currentStock ?? 0,
      privacy,
    );
    if (!result.eligible) throw new JourneyError("CONFLICT");
    return { triggeredAt: requestedAt, evidence: result.evidence };
  }
  if (config.trigger.kind === "price_drop") {
    const privacy =
      customer.privacyStatus === "erasure_requested"
        ? "erased"
        : customer.privacyStatus === "active"
          ? "active"
          : "restricted";
    const result = priceDropTrigger(
      config.trigger.previousPriceHuf ?? 0,
      config.trigger.currentPriceHuf ?? 0,
      config.trigger.referencePriceHuf ?? config.trigger.previousPriceHuf ?? 0,
      privacy,
    );
    if (!result.eligible) throw new JourneyError("CONFLICT");
    return { triggeredAt: requestedAt, evidence: result.evidence };
  }
  const purchase = await Purchase.findOne({
    sellerId,
    customerId,
    status: "purchased",
  })
    .sort({ purchasedAt: -1, _id: -1 })
    .lean();
  if (!purchase) throw new JourneyError("CONFLICT");
  const eligibleAt = new Date(
    purchase.purchasedAt.getTime() + config.trigger.ageDays * 86_400_000,
  );
  if (eligibleAt > new Date()) throw new JourneyError("CONFLICT");
  return {
    triggeredAt: eligibleAt,
    evidence: {
      kind: "purchase_age_days",
      purchaseId: purchase._id.toString(),
      purchasedAt: purchase.purchasedAt.toISOString(),
      ageDays: config.trigger.ageDays,
    },
  };
}

export async function previewJourney(
  userId: string,
  sellerSlug: string,
  raw: unknown,
) {
  const value = input(raw);
  const { seller, membership } = await sellerAccess(userId, sellerSlug);
  if (membership.role !== "owner") throw new JourneyError("FORBIDDEN");
  const { customer, buyer } = await customerBuyer(seller._id, value.customerId);
  const trigger = await triggerEvidence(
    seller._id,
    customer,
    value.config,
    value.triggeredAt,
  );
  const rules = await getSellerSettings(userId, sellerSlug);
  return {
    status: "ready",
    customer: { id: customer._id.toString(), name: customer.name },
    buyerUserId: buyer._id.toString(),
    config: value.config,
    triggerEvidenceHash: evidenceHash(trigger.evidence),
    schedules: value.config.steps.map((step, index) => ({
      key: step.key,
      scheduledFor: scheduledAt(trigger.triggeredAt, value.config.steps, index),
    })),
    rules: rules.rules,
  };
}

export async function enableJourney(
  userId: string,
  sellerSlug: string,
  raw: unknown,
) {
  const value = input(raw);
  const { seller, membership } = await sellerAccess(userId, sellerSlug);
  if (membership.role !== "owner") throw new JourneyError("FORBIDDEN");
  const { customer, buyer } = await customerBuyer(seller._id, value.customerId);
  const effective = await getSellerSettings(userId, sellerSlug);
  const trigger = await triggerEvidence(
    seller._id,
    customer,
    value.config,
    value.triggeredAt,
  );
  const hash = evidenceHash(trigger.evidence);
  const database = await connectDatabase();
  let output: any;
  try {
    await database.connection.transaction(async (session) => {
      const existing = await JourneyDefinition.findOne({
        sellerId: seller._id,
        clientRequestId: value.clientRequestId,
      }).session(session);
      if (existing) {
        output = existing;
        return;
      }
      const [definition] = await JourneyDefinition.create(
        [
          {
            sellerId: seller._id,
            name: value.config.name,
            status: "active",
            activeVersion: 1,
            clientRequestId: value.clientRequestId,
            createdByUserId: userId,
          },
        ],
        { session },
      );
      await JourneyDefinitionVersion.create(
        [
          {
            sellerId: seller._id,
            definitionId: definition._id,
            version: 1,
            ...value.config,
            ruleTemplateKey: DEFAULT_TEMPLATE_KEY,
            ruleTemplateVersion: effective.rules.templateVersion,
            publishedByUserId: userId,
            publishedAt: new Date(),
          },
        ],
        { session },
      );
      const [enrollment] = await JourneyEnrollment.create(
        [
          {
            sellerId: seller._id,
            definitionId: definition._id,
            definitionVersion: 1,
            buyerUserId: buyer._id,
            customerId: customer._id,
            status: "active",
            triggerEvidenceHash: hash,
            triggeredAt: trigger.triggeredAt,
            nextRunAt: scheduledAt(trigger.triggeredAt, value.config.steps, 0),
            reasonCode: "TRIGGER_ACCEPTED",
            createdByUserId: userId,
          },
        ],
        { session },
      );
      await JourneyStepRun.insertMany(
        value.config.steps.map((step, index) => {
          const at = scheduledAt(
            trigger.triggeredAt,
            value.config.steps,
            index,
          );
          return {
            sellerId: seller._id,
            enrollmentId: enrollment._id,
            definitionId: definition._id,
            definitionVersion: 1,
            buyerUserId: buyer._id,
            customerId: customer._id,
            stepKey: step.key,
            stepIndex: index,
            scheduledFor: at,
            nextRunAt: at,
            status: "due",
            ruleSnapshot: {
              templateKey: DEFAULT_TEMPLATE_KEY,
              templateVersion: effective.rules.templateVersion,
              overrideMode: effective.rules.overrideMode,
            },
            contentSnapshot: { title: step.title, channel: step.channel },
            reasonCode: "SCHEDULED",
          };
        }),
        { session },
      );
      output = definition;
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      const existing = await JourneyDefinition.findOne({
        sellerId: seller._id,
        clientRequestId: value.clientRequestId,
      }).lean();
      if (existing) output = existing;
      else throw new JourneyError("CONFLICT");
    } else throw error;
  }
  return {
    id: output._id.toString(),
    name: output.name,
    status: output.status,
    activeVersion: output.activeVersion,
    version: output.version,
  };
}

export async function listJourneys(userId: string, sellerSlug: string) {
  const { seller } = await sellerAccess(userId, sellerSlug);
  const rows = await JourneyDefinition.find({ sellerId: seller._id })
    .sort({ updatedAt: -1 })
    .lean();
  return {
    seller: { id: seller._id.toString(), name: seller.name, slug: seller.slug },
    journeys: await Promise.all(
      rows.map(async (row) => ({
        id: row._id.toString(),
        name: row.name,
        status: row.status,
        activeVersion: row.activeVersion,
        version: row.version,
        counts: Object.fromEntries(
          (
            await JourneyEnrollment.aggregate([
              { $match: { sellerId: seller._id, definitionId: row._id } },
              { $group: { _id: "$status", count: { $sum: 1 } } },
            ])
          ).map((item: any) => [item._id, item.count]),
        ),
      })),
    ),
  };
}

export async function setJourneyStatus(
  userId: string,
  sellerSlug: string,
  journeyId: string,
  status: "active" | "paused",
  expectedVersion: number,
) {
  const { seller, membership } = await sellerAccess(userId, sellerSlug);
  if (membership.role !== "owner") throw new JourneyError("FORBIDDEN");
  if (
    !mongoose.isValidObjectId(journeyId) ||
    !Number.isInteger(expectedVersion)
  )
    throw new JourneyError("INVALID");
  const database = await connectDatabase();
  let output: any;
  await database.connection.transaction(async (session) => {
    const row = await JourneyDefinition.findOneAndUpdate(
      {
        _id: journeyId,
        sellerId: seller._id,
        version: expectedVersion,
        status: { $ne: "retired" },
      },
      { $set: { status }, $inc: { version: 1 } },
      { new: true, session },
    );
    if (!row) throw new JourneyError("CONFLICT");
    if (status === "paused")
      await cancelJourneyDeliveries(
        session,
        seller._id,
        row._id,
        "JOURNEY_PAUSED",
        userId,
      );
    output = row;
  });
  return {
    id: output._id.toString(),
    status: output.status,
    version: output.version,
  };
}

async function runClaimedStep(row: any, workerId: string) {
  const definition = await withTenantBypass(
    "journey-worker-definition",
    async () => await JourneyDefinition.findById(row.definitionId).lean(),
  );
  const enrollment = await withTenantBypass(
    "journey-worker-enrollment",
    async () => await JourneyEnrollment.findById(row.enrollmentId).lean(),
  );
  const now = new Date();
  if (!definition || !enrollment || enrollment.status !== "active") {
    await withTenantBypass(
      "journey-worker-cancel-inactive",
      async () =>
        await JourneyStepRun.updateOne(
          { _id: row._id, lockedBy: workerId },
          {
            $set: {
              status: "cancelled",
              reasonCode: "ENROLLMENT_INACTIVE",
              completedAt: now,
              lockedBy: null,
              lockedUntil: null,
            },
          },
        ),
    );
    return { id: row._id.toString(), status: "cancelled" };
  }
  if (definition.status !== "active") {
    await withTenantBypass(
      "journey-worker-release-paused",
      async () =>
        await JourneyStepRun.updateOne(
          { _id: row._id, lockedBy: workerId },
          {
            $set: {
              status: "due",
              reasonCode: "DEFINITION_PAUSED",
              nextRunAt: new Date(now.getTime() + 600_000),
              lockedBy: null,
              lockedUntil: null,
            },
          },
        ),
    );
    return { id: row._id.toString(), status: "due" };
  }
  const earlier = await withTenantBypass(
    "journey-worker-step-order",
    async () =>
      await JourneyStepRun.exists({
        enrollmentId: row.enrollmentId,
        stepIndex: { $lt: row.stepIndex },
        status: { $in: ["due", "processing", "retryable_failed"] },
      }),
  );
  if (earlier) {
    await withTenantBypass(
      "journey-worker-wait-previous",
      async () =>
        await JourneyStepRun.updateOne(
          { _id: row._id, lockedBy: workerId },
          {
            $set: {
              status: "due",
              reasonCode: "WAITING_PREVIOUS_STEP",
              nextRunAt: new Date(now.getTime() + 300_000),
              lockedBy: null,
              lockedUntil: null,
            },
          },
        ),
    );
    return { id: row._id.toString(), status: "due" };
  }
  if (row.attemptCount >= row.maxAttempts) {
    await withTenantBypass("journey-worker-exhausted-reclaim", async () => {
      await JourneyStepRun.updateOne(
        { _id: row._id, lockedBy: workerId },
        {
          $set: {
            status: "failed",
            reasonCode: "ATTEMPTS_EXHAUSTED",
            failedAt: now,
            lockedBy: null,
            lockedUntil: null,
          },
        },
      );
      await JourneyEnrollment.updateOne(
        { _id: row.enrollmentId },
        {
          $set: {
            status: "failed",
            reasonCode: "STEP_ATTEMPTS_EXHAUSTED",
            failedAt: now,
            nextRunAt: null,
          },
        },
      );
    });
    return { id: row._id.toString(), status: "failed" };
  }
  const claimed = await withTenantBypass(
    "journey-worker-attempt",
    async () =>
      await JourneyStepRun.findOneAndUpdate(
        { _id: row._id, lockedBy: workerId, status: "processing" },
        { $inc: { attemptCount: 1 } },
        { new: true },
      ).lean(),
  );
  if (!claimed) return { id: row._id.toString(), status: "lost_lease" };
  row = claimed;
  try {
    const database = await connectDatabase();
    let status = "completed";
    await database.connection.transaction(async (session) => {
      const stillActive = await JourneyDefinition.exists({
        _id: row.definitionId,
        sellerId: row.sellerId,
        status: "active",
      }).session(session);
      if (!stillActive) throw new Error("JOURNEY_PAUSED_DURING_LEASE");
      const idempotencyKey = `journey:${row.enrollmentId}:${row.stepKey}:${row.scheduledFor.toISOString()}`;
      let delivery = await DeliveryOutbox.findOne({
        sellerId: row.sellerId,
        idempotencyKey,
      }).session(session);
      if (!delivery)
        delivery = await createDeliveryRecord(session, {
          sellerId: row.sellerId,
          buyerUserId: row.buyerUserId,
          customerId: row.customerId,
          journeyDefinitionId: row.definitionId,
          journeyEnrollmentId: row.enrollmentId,
          journeyStepRunId: row._id,
          kind: "journey_step",
          channel: row.contentSnapshot.channel,
          idempotencyKey,
          contentSnapshot: {
            ...row.contentSnapshot,
            definitionVersion: row.definitionVersion,
            ruleSnapshot: row.ruleSnapshot,
          },
          createdByUserId: definition.createdByUserId,
        });
      status = ["suppressed", "unsupported", "cancelled"].includes(
        delivery.status,
      )
        ? "skipped"
        : "completed";
      await JourneyStepRun.updateOne(
        { _id: row._id, lockedBy: workerId },
        {
          $set: {
            status,
            deliveryId: delivery._id,
            reasonCode: delivery.reasonCode,
            completedAt: now,
            lockedBy: null,
            lockedUntil: null,
          },
        },
        { session },
      );
      const remaining = await JourneyStepRun.countDocuments({
        enrollmentId: row.enrollmentId,
        _id: { $ne: row._id },
        status: { $in: ["due", "processing", "retryable_failed"] },
      }).session(session);
      if (!remaining)
        await JourneyEnrollment.updateOne(
          { _id: row.enrollmentId },
          {
            $set: {
              status: "completed",
              reasonCode: "ALL_STEPS_TERMINAL",
              completedAt: now,
              nextRunAt: null,
            },
          },
          { session },
        );
      else {
        const next = await JourneyStepRun.findOne({
          enrollmentId: row.enrollmentId,
          _id: { $ne: row._id },
          status: { $in: ["due", "retryable_failed"] },
        })
          .sort({ nextRunAt: 1 })
          .session(session)
          .lean();
        await JourneyEnrollment.updateOne(
          { _id: row.enrollmentId },
          { $set: { nextRunAt: next?.nextRunAt ?? null } },
          { session },
        );
      }
    });
    return { id: row._id.toString(), status };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "JOURNEY_PAUSED_DURING_LEASE"
    ) {
      await withTenantBypass(
        "journey-worker-paused-race",
        async () =>
          await JourneyStepRun.updateOne(
            { _id: row._id, lockedBy: workerId },
            {
              $set: {
                status: "due",
                reasonCode: "DEFINITION_PAUSED",
                nextRunAt: new Date(now.getTime() + 600_000),
                lockedBy: null,
                lockedUntil: null,
              },
              $inc: { attemptCount: -1 },
            },
          ),
      );
      return { id: row._id.toString(), status: "due" };
    }
    const attempts = row.attemptCount;
    const terminal = attempts >= row.maxAttempts;
    await withTenantBypass("journey-worker-failure", async () => {
      await JourneyStepRun.updateOne(
        { _id: row._id, lockedBy: workerId },
        {
          $set: {
            status: terminal ? "failed" : "retryable_failed",
            reasonCode: terminal ? "ATTEMPTS_EXHAUSTED" : "TRANSIENT_FAILURE",
            nextRunAt: terminal ? row.nextRunAt : retryAt(now, attempts),
            failedAt: terminal ? now : null,
            lockedBy: null,
            lockedUntil: null,
          },
        },
      );
      if (terminal)
        await JourneyEnrollment.updateOne(
          { _id: row.enrollmentId },
          {
            $set: {
              status: "failed",
              reasonCode: "STEP_ATTEMPTS_EXHAUSTED",
              failedAt: now,
              nextRunAt: null,
            },
          },
        );
    });
    return {
      id: row._id.toString(),
      status: terminal ? "failed" : "retryable_failed",
      error: error instanceof Error ? error.message : "UNKNOWN",
    };
  }
}

export async function runDueJourneySteps(limit = 20) {
  await connectDatabase();
  const bounded = Math.min(
    Math.max(Number.isInteger(limit) ? limit : 20, 1),
    50,
  );
  const workerId = `journey-${crypto.randomUUID()}`;
  const results = [];
  for (let index = 0; index < bounded; index += 1) {
    const now = new Date();
    const row = await withTenantBypass(
      "journey-worker-claim",
      async () =>
        await JourneyStepRun.findOneAndUpdate(
          {
            nextRunAt: { $lte: now },
            status: { $in: ["due", "retryable_failed", "processing"] },
            $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
          },
          {
            $set: {
              status: "processing",
              lockedBy: workerId,
              lockedUntil: new Date(now.getTime() + 120_000),
              reasonCode: "CLAIMED",
            },
          },
          { sort: { nextRunAt: 1, _id: 1 }, new: true },
        ).lean(),
    );
    if (!row) break;
    results.push(await runClaimedStep(row, workerId));
  }
  return { processed: results.length, results };
}

export async function buyerJourneyEvidence(userId: string) {
  await connectDatabase();
  const sellerIds = (
    await BuyerRelationship.find({ buyerUserId: userId, status: "active" })
      .select({ sellerId: 1 })
      .lean()
  ).map((row) => row.sellerId);
  if (!sellerIds.length) return { enrollments: [] };
  const rows = await JourneyEnrollment.find({
    buyerUserId: userId,
    sellerId: { $in: sellerIds },
  })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  return {
    enrollments: rows.map((row) => ({
      id: row._id.toString(),
      sellerId: row.sellerId.toString(),
      definitionId: row.definitionId.toString(),
      definitionVersion: row.definitionVersion,
      status: row.status,
      reasonCode: row.reasonCode,
      triggeredAt: row.triggeredAt,
      nextRunAt: row.nextRunAt,
      completedAt: row.completedAt,
      failedAt: row.failedAt,
    })),
  };
}
