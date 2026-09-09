"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/auth/service";
import { applyImport, createProduct, previewImport, updateProduct } from "@/catalog/service";

function productFrom(form: FormData, active?: boolean) {
  return {
    sku: form.get("sku"),
    name: form.get("name"),
    priceHuf: Number(form.get("priceHuf")),
    stock: Number(form.get("stock")),
    category: form.get("category"),
    compatibleWith: String(form.get("compatibleWith") ?? "").split(",").map((item) => item.trim()).filter(Boolean),
    active: active ?? form.get("active") !== "false",
  };
}

async function identity() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  return user;
}

export async function createProductAction(sellerSlug: string, form: FormData) {
  const user = await identity();
  let error = "";
  try { await createProduct(user.id, sellerSlug, productFrom(form)); } catch (cause) { error = cause instanceof Error ? cause.message : "INVALID"; }
  redirect(`/seller/${sellerSlug}${error ? `?error=${encodeURIComponent(error)}` : "?saved=created"}`);
}

export async function saveProductAction(sellerSlug: string, productId: string, version: number, active: boolean, form: FormData) {
  const user = await identity();
  let error = "";
  try { await updateProduct(user.id, sellerSlug, productId, productFrom(form, active), version); } catch (cause) { error = cause instanceof Error ? cause.message : "INVALID"; }
  redirect(`/seller/${sellerSlug}${error ? `?error=${encodeURIComponent(error)}` : "?saved=updated"}`);
}

export async function archiveProductAction(sellerSlug: string, productId: string, version: number, form: FormData) {
  const user = await identity();
  let error = "";
  try {
    if (form.get("confirm") !== "yes") throw new Error("INVALID");
    await updateProduct(user.id, sellerSlug, productId, productFrom(form, false), version);
  } catch (cause) { error = cause instanceof Error ? cause.message : "INVALID"; }
  redirect(`/seller/${sellerSlug}${error ? `?error=${encodeURIComponent(error)}` : "?saved=archived"}`);
}

export async function previewImportAction(sellerSlug: string, form: FormData) {
  const user = await identity();
  let destination = `/seller/${sellerSlug}?error=INVALID`;
  try {
    const rows = JSON.parse(String(form.get("json") ?? ""));
    const batch = await previewImport(user.id, sellerSlug, { schemaVersion: "1", rows });
    destination = `/seller/${sellerSlug}?batch=${batch._id.toString()}`;
  } catch (cause) {
    destination = `/seller/${sellerSlug}?error=${encodeURIComponent(cause instanceof Error ? cause.message : "INVALID")}`;
  }
  redirect(destination);
}

export async function applyImportAction(sellerSlug: string, batchId: string) {
  const user = await identity();
  let error = "";
  try { await applyImport(user.id, sellerSlug, batchId); } catch (cause) { error = cause instanceof Error ? cause.message : "INVALID"; }
  redirect(`/seller/${sellerSlug}${error ? `?batch=${encodeURIComponent(batchId)}&error=${encodeURIComponent(error)}` : "?saved=imported"}`);
}
