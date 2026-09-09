import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedRequestTransition, PRIVACY_NOTICE_VERSION, validatePreferenceInput, validatePrivacyRequestType, validateResolution } from "../src/privacy/validation.ts";

test("privacy preferences require explicit boolean channel values", () => {
  assert.deepEqual(validatePreferenceInput({ email: true, postal: false }), { email: true, postal: false });
  assert.throws(() => validatePreferenceInput({ email: "yes", postal: false }), /preferences/);
  assert.match(PRIVACY_NOTICE_VERSION, /^privacy-hu-/);
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
