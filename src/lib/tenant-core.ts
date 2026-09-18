/* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose hook registration overloads do not expose the dynamic middleware shape we need here. */
import { AsyncLocalStorage } from "node:async_hooks";
import type { PipelineStage, Schema } from "mongoose";

export type TenantSellerId = string | number | { toString(): string };

export type TenantContext =
  | { mode: "seller"; sellerId: TenantSellerId }
  | { mode: "bypass"; reason: string };

export type TenantReadiness =
  | { scoped: true; mode: "seller"; sellerId: string; reason: null }
  | { scoped: true; mode: "bypass"; sellerId: null; reason: string }
  | { scoped: false; mode: null; sellerId: null; reason: "TENANT_CONTEXT_REQUIRED" };

export class TenantScopeError extends Error {
  code: "TENANT_CONTEXT_REQUIRED" | "TENANT_MISMATCH";

  constructor(code: TenantScopeError["code"]) {
    super(code);
    this.code = code;
  }
}

const storage = new AsyncLocalStorage<TenantContext>();
const queryOperations = [
  "countDocuments",
  "deleteMany",
  "deleteOne",
  "distinct",
  "find",
  "findOne",
  "findOneAndDelete",
  "findOneAndReplace",
  "findOneAndUpdate",
  "replaceOne",
  "updateMany",
  "updateOne",
] as const;

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sellerIdString(value: TenantSellerId) {
  return String(value);
}

export function currentTenantContext() {
  return storage.getStore() ?? null;
}

export function tenantReadiness(): TenantReadiness {
  const context = currentTenantContext();
  if (!context) return { scoped: false, mode: null, sellerId: null, reason: "TENANT_CONTEXT_REQUIRED" };
  if (context.mode === "bypass") return { scoped: true, mode: "bypass", sellerId: null, reason: context.reason };
  return { scoped: true, mode: "seller", sellerId: sellerIdString(context.sellerId), reason: null };
}

export function withSellerTenant<T>(sellerId: TenantSellerId, callback: () => T): T {
  return storage.run({ mode: "seller", sellerId }, callback);
}

export function withTenantBypass<T>(reason: string, callback: () => T): T {
  if (!reason.trim()) throw new TenantScopeError("TENANT_CONTEXT_REQUIRED");
  return storage.run({ mode: "bypass", reason: reason.trim() }, callback);
}

export function hasSellerConstraint(filter: unknown): boolean {
  if (!plainObject(filter)) return false;
  if (Object.prototype.hasOwnProperty.call(filter, "sellerId")) return true;
  for (const key of ["$and", "$or"]) {
    const clauses = filter[key];
    if (Array.isArray(clauses) && clauses.some((clause) => hasSellerConstraint(clause))) return true;
  }
  return false;
}

export function tenantScopedQueryFilter(filter: Record<string, unknown>, sellerId: TenantSellerId) {
  if (!plainObject(filter) || !Object.keys(filter).length) return { sellerId };
  return { $and: [filter, { sellerId }] };
}

export function pipelineStartsWithSellerConstraint(pipeline: PipelineStage[]) {
  const first = pipeline[0] as unknown as Record<string, unknown> | undefined;
  return plainObject(first) && hasSellerConstraint(first.$match);
}

export function tenantScopedPipeline(pipeline: PipelineStage[], sellerId: TenantSellerId) {
  return [{ $match: { sellerId } } as PipelineStage, ...pipeline];
}

function sellerIdsMatch(left: unknown, right: unknown) {
  return String(left) === String(right);
}

function docValue(document: Record<string, unknown>, path: string) {
  const candidate = document as { get?: (field: string) => unknown };
  return typeof candidate.get === "function" ? candidate.get(path) : document[path];
}

function setDocValue(document: Record<string, unknown>, path: string, value: unknown) {
  const candidate = document as { set?: (field: string, value: unknown) => void };
  if (typeof candidate.set === "function") candidate.set(path, value);
  else document[path] = value;
}

function guardDocument(document: Record<string, unknown>, context: TenantContext | null, allowExplicitSellerId: boolean) {
  if (context?.mode === "bypass") return;
  const currentSellerId = docValue(document, "sellerId");
  if (context?.mode === "seller") {
    if (currentSellerId == null) {
      setDocValue(document, "sellerId", context.sellerId);
      return;
    }
    if (!sellerIdsMatch(currentSellerId, context.sellerId)) throw new TenantScopeError("TENANT_MISMATCH");
    return;
  }
  if (allowExplicitSellerId && currentSellerId != null) return;
  throw new TenantScopeError("TENANT_CONTEXT_REQUIRED");
}

export function sellerScopedSchema(schema: Schema, options: { allowExplicitSellerId?: boolean } = {}) {
  const allowExplicitSellerId = options.allowExplicitSellerId ?? true;

  for (const operation of queryOperations) {
    (schema as any).pre(operation, function tenantQueryGuard(this: unknown) {
      const context = currentTenantContext();
      if (context?.mode === "bypass") return;

      const query = this as { getFilter: () => Record<string, unknown>; setQuery: (filter: unknown) => void };
      const filter = query.getFilter();
      if (context?.mode === "seller") {
        query.setQuery(tenantScopedQueryFilter(filter, context.sellerId));
        return;
      }

      if (allowExplicitSellerId && hasSellerConstraint(filter)) return;

      throw new TenantScopeError("TENANT_CONTEXT_REQUIRED");
    });
  }

  (schema as any).pre("aggregate", function tenantAggregateGuard(this: unknown) {
    const context = currentTenantContext();
    if (context?.mode === "bypass") return;

    const aggregate = this as { pipeline: () => PipelineStage[] };
    const pipeline = aggregate.pipeline();
    if (context?.mode === "seller") {
      pipeline.unshift({ $match: { sellerId: context.sellerId } });
      return;
    }

    if (allowExplicitSellerId && pipelineStartsWithSellerConstraint(pipeline)) return;

    throw new TenantScopeError("TENANT_CONTEXT_REQUIRED");
  });

  (schema as any).pre("save", function tenantSaveGuard(this: unknown) {
    guardDocument(this as unknown as Record<string, unknown>, currentTenantContext(), allowExplicitSellerId);
  });

  (schema as any).pre("insertMany", function tenantInsertManyGuard(
    this: unknown,
    docs: Record<string, unknown>[],
  ) {
    for (const doc of docs) guardDocument(doc, currentTenantContext(), allowExplicitSellerId);
  });
}
