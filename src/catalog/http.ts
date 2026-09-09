import { errorResponse, isSameOrigin } from "@/auth/http";
import { CatalogError } from "./service";

export async function jsonBody(request: Request, maxBytes = 16_384) {
  if (!isSameOrigin(request)) return { response: errorResponse("INVALID_ORIGIN", "A kérés eredete nem engedélyezett.", 403) };
  const contentType = request.headers.get("content-type")?.split(";", 1)[0];
  const length = Number(request.headers.get("content-length") ?? 0);
  if (contentType !== "application/json" || !Number.isFinite(length) || length > maxBytes) {
    return { response: errorResponse("INVALID_REQUEST", "Érvénytelen vagy túl nagy kérés.", 400) };
  }
  try {
    return { body: await request.json() };
  } catch {
    return { response: errorResponse("INVALID_REQUEST", "A JSON nem olvasható.", 400) };
  }
}

export function catalogError(error: unknown) {
  if (error instanceof CatalogError) {
    const map = {
      FORBIDDEN: ["FORBIDDEN", "Ehhez az eladóhoz nincs hozzáférésed.", 403],
      NOT_FOUND: ["NOT_FOUND", "A keresett elem nem található.", 404],
      INVALID: ["INVALID_PRODUCT", "A termékadatok érvénytelenek.", 400],
      CONFLICT: ["DUPLICATE_SKU", "Ez a cikkszám már létezik.", 409],
      STALE: ["STALE_VERSION", "A termék időközben megváltozott. Frissítsd az oldalt.", 409],
      TOO_LARGE: ["IMPORT_LIMIT", "Az import 1–100 sort tartalmazhat.", 400],
    } as const;
    const [code, message, status] = map[error.code];
    return errorResponse(code, message, status);
  }
  return errorResponse("CATALOG_UNAVAILABLE", "A katalógus átmenetileg nem érhető el.", 503);
}
