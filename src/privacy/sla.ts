export type PrivacySlaStatus = "pending" | "reminder_due" | "overdue" | "acknowledged" | "completed";

export type PrivacySlaPolicy = {
  deadlineDays: number;
  reminderDaysBefore: number;
  version: string;
};

export type PrivacySlaState = {
  dueAt: Date;
  reminderAt: Date;
  status: PrivacySlaStatus;
  lastAlertAt: Date | null;
  policyVersion: string;
};

export const defaultPrivacySlaPolicy: PrivacySlaPolicy = { deadlineDays: 30, reminderDaysBefore: 7, version: "privacy-sla-hu-2026-09-25-v1" };

export function calculatePrivacySla(requestedAt: Date, policy: PrivacySlaPolicy = defaultPrivacySlaPolicy): PrivacySlaState {
  const deadlineDays = Math.min(Math.max(Math.floor(policy.deadlineDays), 1), 3650);
  const reminderDaysBefore = Math.min(Math.max(Math.floor(policy.reminderDaysBefore), 0), deadlineDays);
  const dueAt = new Date(requestedAt.getTime() + deadlineDays * 86_400_000);
  return {
    dueAt,
    reminderAt: new Date(dueAt.getTime() - reminderDaysBefore * 86_400_000),
    status: "pending",
    lastAlertAt: null,
    policyVersion: policy.version.trim().slice(0, 80),
  };
}

export function nextPrivacySlaState(state: PrivacySlaState, now: Date, completed: boolean): PrivacySlaState {
  if (completed) return { ...state, status: "completed" };
  if (state.status === "acknowledged") return state;
  if (now.getTime() >= state.dueAt.getTime()) return { ...state, status: "overdue" };
  if (now.getTime() >= state.reminderAt.getTime()) return { ...state, status: "reminder_due" };
  return { ...state, status: "pending" };
}

export function shouldEmitPrivacyAlert(state: PrivacySlaState, now: Date, cadenceMs = 86_400_000) {
  if (!(["reminder_due", "overdue"] as string[]).includes(state.status)) return false;
  return !state.lastAlertAt || now.getTime() - state.lastAlertAt.getTime() >= cadenceMs;
}
