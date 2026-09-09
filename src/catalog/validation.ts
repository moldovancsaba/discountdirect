export type ProductInput = {
  sku: string;
  skuNormalized: string;
  name: string;
  priceHuf: number;
  stock: number;
  category: string;
  compatibleWith: string[];
  active: boolean;
};

function text(value: unknown, max: number, field: string) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new Error(field);
  return value.trim();
}

export function validateProductInput(value: unknown): ProductInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("record");
  const row = value as Record<string, unknown>;
  const sku = text(row.sku, 64, "sku");
  if (!/^[A-Za-z0-9._-]+$/.test(sku)) throw new Error("sku");
  const name = text(row.name, 160, "name");
  const category = text(row.category, 80, "category");
  if (!Number.isInteger(row.priceHuf) || Number(row.priceHuf) < 0 || Number(row.priceHuf) > 1_000_000_000) throw new Error("priceHuf");
  if (!Number.isInteger(row.stock) || Number(row.stock) < 0 || Number(row.stock) > 1_000_000) throw new Error("stock");
  const compatible = row.compatibleWith ?? [];
  if (!Array.isArray(compatible) || compatible.length > 20) throw new Error("compatibleWith");
  const compatibleWith = [...new Set(compatible.map((item) => text(item, 80, "compatibleWith")))];
  if (row.active !== undefined && typeof row.active !== "boolean") throw new Error("active");
  return { sku, skuNormalized: sku.toUpperCase(), name, priceHuf: Number(row.priceHuf), stock: Number(row.stock), category, compatibleWith, active: row.active ?? true };
}

export function productInputErrors(value: unknown) {
  try {
    validateProductInput(value);
    return [];
  } catch (error) {
    return [error instanceof Error ? error.message : "record"];
  }
}
