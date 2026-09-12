import fs from "node:fs";
import assert from "node:assert/strict";

const base = process.env.SMOKE_BASE_URL ?? "https://discountdirect.vercel.app";

function localEnv(file) {
  if (!fs.existsSync(file)) return {};
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const key = trimmed.slice(0, trimmed.indexOf("="));
    let value = line.slice(line.indexOf("=") + 1);
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[key] = value;
  }
  return env;
}

async function text(path, options) {
  const response = await fetch(new URL(path, base), options);
  return { response, body: await response.text() };
}

async function json(path, options) {
  const { response, body } = await text(path, options);
  return { response, body: JSON.parse(body) };
}

function includesAll(body, values) {
  for (const value of values) assert.match(body, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

const prodEnv = { ...localEnv(".env.production.local"), ...process.env };
const checks = [];

{
  const { response, body } = await text("/");
  assert.equal(response.status, 200);
  includesAll(body, ["lang=\"hu\"", "Ugrás a tartalomhoz", "id=\"main\"", "Bejelentkezés"]);
  checks.push("public overview renders Hungarian shell with skip link and main landmark");
}

{
  const { response, body } = await text("/sign-in");
  assert.equal(response.status, 200);
  includesAll(body, ["E-mail-cím", "Jelszó", "Bejelentkezés DoneIsBetter SSO-val", "type=\"email\"", "type=\"password\"", "autoComplete=\"username\"", "autoComplete=\"current-password\""]);
  checks.push("sign-in form exposes labels and autocomplete hints");
}

{
  const { response, body } = await text("/admin");
  assert.equal(response.status, 200);
  includesAll(body, ["Üzemeltetői hozzáférés", "Hozzáférési kulcs", "type=\"password\"", "autoComplete=\"current-password\""]);
  checks.push("operator gate renders without exposing protected metrics");
}

for (const path of ["/account", "/buyer/offers", "/buyer/lists", "/buyer/redemptions", "/seller/sample-shop"]) {
  const response = await fetch(new URL(path, base), { redirect: "manual" });
  assert.equal(response.status, 307, `${path} should redirect unauthenticated users`);
  assert.equal(new URL(response.headers.get("location"), base).pathname, "/sign-in");
}
checks.push("protected buyer/seller/account routes redirect unauthenticated users to sign-in");

{
  const { response, body } = await json("/api/health/live");
  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.service, "discountdirect");
  assert.equal(body.version, "1.5.0");
  checks.push("public liveness reports release 1.5.0");
}

{
  const { response, body } = await json("/api/health/ready");
  assert.equal(response.status, 401);
  assert.equal(body.error.code, "UNAUTHORIZED");
  checks.push("readiness fails closed without operator token");
}

if (prodEnv.OPERATIONS_TOKEN) {
  const { response, body } = await json("/api/health/ready", { headers: { Authorization: `Bearer ${prodEnv.OPERATIONS_TOKEN}` } });
  assert.equal(response.status, 200);
  assert.equal(body.status, "ready");
  assert.equal(body.database.connected, true);
  checks.push("readiness succeeds with operator token and Atlas connection");
}

{
  const { response, body } = await json("/api/cron/automations?limit=1");
  assert.equal(response.status, 401);
  assert.equal(body.error.code, "UNAUTHORIZED");
  checks.push("automation cron fails closed without cron token");
}

{
  const { response, body } = await json("/api/cron/deliveries?limit=1");
  assert.equal(response.status, 401);
  assert.equal(body.error.code, "UNAUTHORIZED");
  checks.push("delivery cron fails closed without cron token");
}

if (prodEnv.CRON_SECRET) {
  const { response, body } = await json("/api/cron/automations?limit=1", { headers: { Authorization: `Bearer ${prodEnv.CRON_SECRET}` } });
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body.results));
  checks.push("automation cron accepts cron token and returns bounded results");
}

if (prodEnv.CRON_SECRET) {
  const { response, body } = await json("/api/cron/deliveries?limit=1", { headers: { Authorization: `Bearer ${prodEnv.CRON_SECRET}` } });
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body.results));
  checks.push("delivery cron accepts cron token and returns bounded results");
}

console.log(`Quality audit passed for ${base}`);
for (const check of checks) console.log(`- ${check}`);
