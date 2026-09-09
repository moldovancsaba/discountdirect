import { errorResponse } from "@/auth/http";
import { PurchaseError } from "./service";

export function purchaseError(error: unknown) {
  if (error instanceof PurchaseError) {
    const map = {
      FORBIDDEN: ["FORBIDDEN", "Ehhez az eladóhoz nincs hozzáférésed.", 403],
      NOT_FOUND: ["NOT_FOUND", "A keresett vásárlási adat nem található.", 404],
      INVALID: ["INVALID_PURCHASE", "A vásárlási adatok érvénytelenek.", 400],
      CONFLICT: ["DUPLICATE_LINE", "Ez a rendelési tétel már létezik.", 409],
      TOO_LARGE: ["IMPORT_LIMIT", "Az import 1–200 sort tartalmazhat.", 400],
      STALE: ["STALE_VERSION", "A tétel időközben megváltozott. Frissítsd az oldalt.", 409],
    } as const;
    const [code, message, status] = map[error.code];
    return errorResponse(code, message, status);
  }
  return errorResponse("PURCHASES_UNAVAILABLE", "A vásárlási előzmények átmenetileg nem érhetők el.", 503);
}
