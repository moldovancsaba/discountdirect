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

async function readJson(path, options) {
  const started = Date.now();
  const response = await fetch(new URL(path, base), options);
  const text = await response.text();
  const latencyMs = Date.now() - started;
  let body;
  try { body = JSON.parse(text); }
  catch { body = { parseError: text.slice(0, 200) }; }
  return { response, body, latencyMs };
}

const env = { ...localEnv(".env.production.local"), ...process.env };
const findings = [];

const live = await readJson("/api/health/live");
assert.equal(live.response.status, 200, "liveness must return HTTP 200");
assert.equal(live.body.status, "ok", "liveness status must be ok");
assert.equal(live.body.version, "1.4.0", "liveness version must match release 1.4.0");
findings.push({ check: "live", status: "ok", latencyMs: live.latencyMs, version: live.body.version });

const readyDenied = await readJson("/api/health/ready");
assert.equal(readyDenied.response.status, 401, "readiness must reject missing token");
assert.equal(readyDenied.body.error?.code, "UNAUTHORIZED", "readiness unauthorized response must be explicit");
findings.push({ check: "ready_unauthorized", status: "ok", latencyMs: readyDenied.latencyMs });

if (!env.OPERATIONS_TOKEN) throw new Error("OPERATIONS_TOKEN unavailable for production monitor");
const ready = await readJson("/api/health/ready", { headers: { Authorization: `Bearer ${env.OPERATIONS_TOKEN}` } });
assert.equal(ready.response.status, 200, "readiness must return HTTP 200 with token");
assert.equal(ready.body.status, "ready", "readiness status must be ready");
assert.equal(ready.body.database?.connected, true, "database must be connected");
findings.push({ check: "ready_authorized", status: "ok", latencyMs: ready.latencyMs, databaseLatencyMs: ready.body.database.latencyMs });

const cronDenied = await readJson("/api/cron/automations?limit=1");
assert.equal(cronDenied.response.status, 401, "cron must reject missing token");
assert.equal(cronDenied.body.error?.code, "UNAUTHORIZED", "cron unauthorized response must be explicit");
findings.push({ check: "cron_unauthorized", status: "ok", latencyMs: cronDenied.latencyMs });

if (!env.CRON_SECRET) throw new Error("CRON_SECRET unavailable for production monitor");
const cron = await readJson("/api/cron/automations?limit=1", { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } });
assert.equal(cron.response.status, 200, "cron must return HTTP 200 with token");
assert.ok(Array.isArray(cron.body.results), "cron response must include bounded results array");
findings.push({ check: "cron_authorized", status: "ok", latencyMs: cron.latencyMs, processed: cron.body.processed });

console.log(JSON.stringify({ service: "discountdirect", base, checkedAt: new Date().toISOString(), status: "ok", findings }, null, 2));
