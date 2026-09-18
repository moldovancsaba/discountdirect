import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import { join, relative } from "node:path";
import { accessPolicyForSurface, permits, platformRoles, sellerRole } from "../src/auth/roles-core.ts";

async function surfaceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return surfaceFiles(path);
    return entry.name === "route.ts" || entry.name === "actions.ts" ? [path] : [];
  }));
  return nested.flat();
}

function exportedHandlers(source: string) {
  const names = new Set<string>();
  for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g)) names.add(match[1]);
  for (const match of source.matchAll(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=/g)) names.add(match[1]);
  return [...names];
}

test("DoneIsBetter and local scope map to canonical platform roles", () => {
  assert.equal(sellerRole("owner"), "seller_admin");
  assert.equal(sellerRole("staff"), "seller_agent");
  assert.deepEqual(platformRoles({ systemRole: "operator", membershipRoles: ["staff", "owner"], hasBuyerRelationship: true }), ["seller_admin", "seller_agent", "buyer", "platform_ops"]);
});

test("role decisions fail closed", () => {
  assert.equal(permits(["seller_admin"], ["seller_agent"]), false);
  assert.equal(permits(["buyer"], ["buyer"]), true);
  assert.equal(permits("authenticated", [], true), true);
  assert.equal(permits("public", ["platform_ops"]), false);
  assert.equal(permits("machine", ["platform_ops"]), false);
});

test("every Route Handler and Server Action has an authorization policy", async () => {
  const appRoot = join(process.cwd(), "src/app");
  const uncovered: string[] = [];
  let count = 0;
  for (const file of await surfaceFiles(appRoot)) {
    const source = await readFile(file, "utf8");
    for (const handler of exportedHandlers(source)) {
      count += 1;
      const name = `${relative(process.cwd(), file)}#${handler}`;
      if (!accessPolicyForSurface(file, handler)) uncovered.push(name);
    }
  }
  assert.ok(count >= 80, `expected the complete application surface, found ${count}`);
  assert.deepEqual(uncovered, []);
});

test("local password endpoints are classified as hard SSO-only refusals", () => {
  assert.equal(accessPolicyForSurface("src/app/api/auth/activate/route.ts", "POST"), "sso_only_refusal");
  assert.equal(accessPolicyForSurface("src/app/api/auth/session/route.ts", "POST"), "sso_only_refusal");
});
