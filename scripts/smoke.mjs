import assert from "node:assert/strict";
const base = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const get = (path) => fetch(new URL(path, base), { redirect: "manual" });
const home = await get("/");
assert.equal(home.status, 200);
assert.match(await home.text(), /Minden jó ajánlat/);
const admin = await get("/admin");
assert.equal(admin.status, 200);
const locked = await admin.text();
assert.match(locked, /Üzemeltetői hozzáférés/);
assert.doesNotMatch(locked, /MongoDB Atlas/);
assert.equal((await get("/api/health/live")).status, 200);
assert.equal((await get("/api/health/ready")).status, 401);
assert.equal((await get("/does-not-exist")).status, 404);
if (process.env.OPERATIONS_TOKEN) {
  const response = await fetch(new URL("/api/health/ready", base), {
    headers: { Authorization: `Bearer ${process.env.OPERATIONS_TOKEN}` },
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.database.connected, true);
  assert.equal(result.presence.activeUsers, null);
  assert.match(response.headers.get("cache-control"), /no-store/);
  console.log("Authenticated readiness and Atlas ping passed.");
}
console.log(
  "HTTP smoke checks passed: home, protected dashboard, liveness, unauthorized readiness and 404.",
);
