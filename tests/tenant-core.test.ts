import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
  hasSellerConstraint,
  pipelineStartsWithSellerConstraint,
  tenantReadiness,
  tenantScopedPipeline,
  tenantScopedQueryFilter,
  withSellerTenant,
  withTenantBypass,
  sellerScopedSchema,
} from "../src/lib/tenant-core.ts";

test("tenant readiness is explicit outside and inside seller scope", () => {
  assert.deepEqual(tenantReadiness(), {
    scoped: false,
    mode: null,
    sellerId: null,
    reason: "TENANT_CONTEXT_REQUIRED",
  });
  assert.deepEqual(withSellerTenant("seller_1", () => tenantReadiness()), {
    scoped: true,
    mode: "seller",
    sellerId: "seller_1",
    reason: null,
  });
});

test("tenant query scoping preserves original filters and forces seller match", () => {
  const filter = tenantScopedQueryFilter({ _id: "row_1", status: "active" }, "seller_1");
  assert.deepEqual(filter, {
    $and: [{ _id: "row_1", status: "active" }, { sellerId: "seller_1" }],
  });
});

test("cross-tenant filters become impossible instead of widening access", () => {
  const filter = tenantScopedQueryFilter({ sellerId: "seller_2", status: "active" }, "seller_1");
  assert.deepEqual(filter, {
    $and: [{ sellerId: "seller_2", status: "active" }, { sellerId: "seller_1" }],
  });
});

test("seller constraints are detected in plain and compound filters", () => {
  assert.equal(hasSellerConstraint({ sellerId: "seller_1" }), true);
  assert.equal(hasSellerConstraint({ $and: [{ status: "active" }, { sellerId: "seller_1" }] }), true);
  assert.equal(hasSellerConstraint({ buyerUserId: "buyer_1" }), false);
});

test("aggregate pipelines require a leading seller match or receive tenant injection", () => {
  assert.equal(pipelineStartsWithSellerConstraint([{ $match: { sellerId: "seller_1" } }, { $limit: 10 }]), true);
  assert.equal(pipelineStartsWithSellerConstraint([{ $group: { _id: "$status" } }]), false);
  assert.deepEqual(tenantScopedPipeline([{ $group: { _id: "$status" } }], "seller_1"), [
    { $match: { sellerId: "seller_1" } },
    { $group: { _id: "$status" } },
  ]);
});

test("tenant bypass requires a named reason", () => {
  assert.throws(() => withTenantBypass(" ", () => tenantReadiness()), /TENANT_CONTEXT_REQUIRED/);
  assert.deepEqual(withTenantBypass("provider-webhook-lookup", () => tenantReadiness()), {
    scoped: true,
    mode: "bypass",
    sellerId: null,
    reason: "provider-webhook-lookup",
  });
});

test("Mongoose 9 query middleware rejects an actual unscoped query", async () => {
  const schema = new mongoose.Schema({ sellerId: mongoose.Schema.Types.ObjectId }, { bufferCommands: false });
  schema.plugin(sellerScopedSchema);
  const name = `TenantGuardProbe${Date.now()}`;
  const Model = mongoose.model(name, schema);
  await assert.rejects(Model.findOne({}).exec(), (error: unknown) => error instanceof Error && error.message === "TENANT_CONTEXT_REQUIRED");
  mongoose.deleteModel(name);
});
