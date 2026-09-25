import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedRequestTransition, PRIVACY_NOTICE_VERSION, validatePreferenceInput, validatePrivacyRequestType, validateResolution } from "../src/privacy/validation.ts";
import { calculatePrivacySla, nextPrivacySlaState, shouldEmitPrivacyAlert } from "../src/privacy/sla.ts";

test("privacy preferences require explicit boolean channel values", () => {
  assert.deepEqual(validatePreferenceInput({ email: true, postal: false }), { email: true, postal: false, whatsapp: false, rcs: false });
  assert.deepEqual(validatePreferenceInput({ email: false, postal: false, whatsapp: true, rcs: true }), { email: false, postal: false, whatsapp: true, rcs: true });
  assert.throws(() => validatePreferenceInput({ email: "yes", postal: false }), /preferences/);
  assert.match(PRIVACY_NOTICE_VERSION, /^privacy-hu-/);
});

test("privacy SLA deadlines and reminder boundaries are deterministic", () => {
  const requestedAt = new Date("2026-09-01T00:00:00Z");
  const state = calculatePrivacySla(requestedAt, { deadlineDays: 30, reminderDaysBefore: 7, version: "v1" });
  assert.equal(state.reminderAt.toISOString(), "2026-09-24T00:00:00.000Z");
  assert.equal(state.dueAt.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(nextPrivacySlaState(state, new Date("2026-09-24T00:00:00Z"), false).status, "reminder_due");
  assert.equal(nextPrivacySlaState(state, new Date("2026-10-01T00:00:00Z"), false).status, "overdue");
  assert.equal(nextPrivacySlaState(state, new Date("2026-10-01T00:00:00Z"), true).status, "completed");
});

test("privacy SLA alerts are cadence-bound and never emit for pending work", () => {
  const state = calculatePrivacySla(new Date("2026-09-01T00:00:00Z"));
  const due = nextPrivacySlaState(state, new Date("2026-09-24T00:00:00Z"), false);
  assert.equal(shouldEmitPrivacyAlert(due, new Date("2026-09-24T00:00:00Z")), true);
  assert.equal(shouldEmitPrivacyAlert({ ...due, lastAlertAt: new Date("2026-09-24T12:00:00Z") }, new Date("2026-09-25T00:00:00Z")), false);
  assert.equal(shouldEmitPrivacyAlert(state, new Date("2026-09-02T00:00:00Z")), false);
});

test("privacy request inputs and state transitions are bounded", () => {
  assert.equal(validatePrivacyRequestType("access_export"), "access_export");
  assert.throws(() => validatePrivacyRequestType("account_delete"), /requestType/);
  assert.equal(validateResolution(" Ellenőrzött feldolgozás "), "Ellenőrzött feldolgozás");
  assert.throws(() => validateResolution(" "), /resolution/);
  assert.equal(isAllowedRequestTransition("requested", "processing"), true);
  assert.equal(isAllowedRequestTransition("processing", "completed"), true);
  assert.equal(isAllowedRequestTransition("failed", "processing"), true);
  assert.equal(isAllowedRequestTransition("completed", "processing"), false);
  assert.equal(isAllowedRequestTransition("requested", "completed"), false);
});
