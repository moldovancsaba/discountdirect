import { createHash } from "node:crypto";

export type JourneyChannel = "in_app" | "email" | "postal";
export type JourneyStep = {
  key: string;
  delayMinutes: number;
  channel: JourneyChannel;
  title: string;
};
export type JourneyTrigger = {
  kind:
    | "manual"
    | "purchase_age_days"
    | "birthday"
    | "back_in_stock"
    | "price_drop";
  ageDays: number;
  productId?: string;
  birthday?: string;
  previousStock?: number;
  currentStock?: number;
  previousPriceHuf?: number;
  currentPriceHuf?: number;
  referencePriceHuf?: number;
  privacyStatus?: "active" | "restricted" | "erasure_requested" | "erased";
};
export type JourneyConfig = {
  name: string;
  trigger: JourneyTrigger;
  steps: JourneyStep[];
};

export function validateJourneyConfig(input: unknown): JourneyConfig {
  if (!input || typeof input !== "object") throw new Error("journey.invalid");
  const value = input as Record<string, unknown>;
  const rawTrigger = value.trigger as Record<string, unknown> | undefined;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const kind = rawTrigger?.kind;
  const ageDays = Number(rawTrigger?.ageDays ?? 0);
  if (
    !name ||
    name.length > 160 ||
    ![
      "manual",
      "purchase_age_days",
      "birthday",
      "back_in_stock",
      "price_drop",
    ].includes(String(kind)) ||
    !Number.isInteger(ageDays) ||
    ageDays < 0 ||
    ageDays > 3660 ||
    !Array.isArray(value.steps) ||
    value.steps.length < 1 ||
    value.steps.length > 10
  )
    throw new Error("journey.invalid");
  const keys = new Set<string>();
  const steps = value.steps.map((raw, index) => {
    if (!raw || typeof raw !== "object")
      throw new Error("journey.step.invalid");
    const step = raw as Record<string, unknown>;
    const key =
      typeof step.key === "string" ? step.key.trim() : `step-${index + 1}`;
    const title = typeof step.title === "string" ? step.title.trim() : "";
    const delayMinutes = Number(step.delayMinutes);
    const channel = String(step.channel) as JourneyChannel;
    if (
      !/^[a-z0-9-]{2,60}$/.test(key) ||
      keys.has(key) ||
      !title ||
      title.length > 160 ||
      !Number.isInteger(delayMinutes) ||
      delayMinutes < 0 ||
      delayMinutes > 525_600 ||
      !["in_app", "email", "postal"].includes(channel)
    )
      throw new Error("journey.step.invalid");
    keys.add(key);
    return { key, title, delayMinutes, channel };
  });
  const trigger: JourneyTrigger = {
    kind: kind as JourneyTrigger["kind"],
    ageDays,
  };
  if (rawTrigger?.productId !== undefined) {
    if (
      typeof rawTrigger.productId !== "string" ||
      !/^[a-f\d]{24}$/i.test(rawTrigger.productId)
    )
      throw new Error("journey.invalid");
    trigger.productId = rawTrigger.productId;
  }
  for (const key of [
    "previousStock",
    "currentStock",
    "previousPriceHuf",
    "currentPriceHuf",
    "referencePriceHuf",
  ] as const)
    if (rawTrigger?.[key] !== undefined) {
      const number = Number(rawTrigger[key]);
      if (!Number.isInteger(number) || number < 0)
        throw new Error("journey.invalid");
      trigger[key] = number;
    }
  if (rawTrigger?.birthday !== undefined) {
    if (
      typeof rawTrigger.birthday !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(rawTrigger.birthday)
    )
      throw new Error("journey.invalid");
    trigger.birthday = rawTrigger.birthday;
  }
  if (
    rawTrigger?.privacyStatus !== undefined &&
    !["active", "restricted", "erasure_requested", "erased"].includes(
      String(rawTrigger.privacyStatus),
    )
  )
    throw new Error("journey.invalid");
  if (rawTrigger?.privacyStatus !== undefined)
    trigger.privacyStatus =
      rawTrigger.privacyStatus as JourneyTrigger["privacyStatus"];
  return { name, trigger, steps };
}

export function evidenceHash(input: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
export function scheduledAt(
  triggeredAt: Date,
  steps: JourneyStep[],
  index: number,
) {
  return new Date(
    triggeredAt.getTime() +
      steps
        .slice(0, index + 1)
        .reduce((sum, step) => sum + step.delayMinutes, 0) *
        60_000,
  );
}
export function retryAt(now: Date, attempt: number) {
  const minutes = [5, 30, 120][Math.max(0, Math.min(attempt - 1, 2))];
  return new Date(now.getTime() + minutes * 60_000);
}
export function reclaimable(
  status: string,
  lockedUntil: Date | null,
  now: Date,
) {
  return (
    status === "due" ||
    status === "retryable_failed" ||
    (status === "processing" && Boolean(lockedUntil && lockedUntil <= now))
  );
}
