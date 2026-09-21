import { createHash } from "node:crypto";

export type JourneyChannel = "in_app" | "email" | "postal";
export type JourneyStep = { key: string; delayMinutes: number; channel: JourneyChannel; title: string };
export type JourneyConfig = { name: string; trigger: { kind: "manual" | "purchase_age_days"; ageDays: number }; steps: JourneyStep[] };

export function validateJourneyConfig(input: unknown): JourneyConfig {
  if (!input || typeof input !== "object") throw new Error("journey.invalid");
  const value = input as Record<string, unknown>;
  const trigger = value.trigger as Record<string, unknown> | undefined;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const kind = trigger?.kind;
  const ageDays = Number(trigger?.ageDays ?? 0);
  if (!name || name.length > 160 || !["manual", "purchase_age_days"].includes(String(kind)) || !Number.isInteger(ageDays) || ageDays < 0 || ageDays > 3660 || !Array.isArray(value.steps) || value.steps.length < 1 || value.steps.length > 10) throw new Error("journey.invalid");
  const keys = new Set<string>();
  const steps = value.steps.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw new Error("journey.step.invalid");
    const step = raw as Record<string, unknown>;
    const key = typeof step.key === "string" ? step.key.trim() : `step-${index + 1}`;
    const title = typeof step.title === "string" ? step.title.trim() : "";
    const delayMinutes = Number(step.delayMinutes);
    const channel = String(step.channel) as JourneyChannel;
    if (!/^[a-z0-9-]{2,60}$/.test(key) || keys.has(key) || !title || title.length > 160 || !Number.isInteger(delayMinutes) || delayMinutes < 0 || delayMinutes > 525_600 || !["in_app", "email", "postal"].includes(channel)) throw new Error("journey.step.invalid");
    keys.add(key);
    return { key, title, delayMinutes, channel };
  });
  return { name, trigger: { kind: kind as JourneyConfig["trigger"]["kind"], ageDays }, steps };
}

export function evidenceHash(input: Record<string, unknown>) { return createHash("sha256").update(JSON.stringify(input)).digest("hex"); }
export function scheduledAt(triggeredAt: Date, steps: JourneyStep[], index: number) { return new Date(triggeredAt.getTime() + steps.slice(0, index + 1).reduce((sum, step) => sum + step.delayMinutes, 0) * 60_000); }
export function retryAt(now: Date, attempt: number) { const minutes = [5, 30, 120][Math.max(0, Math.min(attempt - 1, 2))]; return new Date(now.getTime() + minutes * 60_000); }
export function reclaimable(status: string, lockedUntil: Date | null, now: Date) { return status === "due" || status === "retryable_failed" || (status === "processing" && Boolean(lockedUntil && lockedUntil <= now)); }
