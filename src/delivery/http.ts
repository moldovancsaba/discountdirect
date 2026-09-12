import { errorResponse } from "@/auth/http";
import { DeliveryError } from "./service";

export function deliveryError(error: unknown) {
  if (error instanceof DeliveryError) {
    const map = {
      FORBIDDEN: ["FORBIDDEN", "Ehhez a kézbesítési naplóhoz nincs hozzáférésed.", 403],
      NOT_FOUND: ["NOT_FOUND", "A keresett kézbesítési adat nem található.", 404],
      INVALID: ["INVALID_DELIVERY", "A kézbesítési kérés érvénytelen.", 400],
      CONFLICT: ["DELIVERY_CONFLICT", "A kézbesítés állapota közben megváltozott.", 409],
    } as const;
    const [code, message, status] = map[error.code];
    return errorResponse(code, message, status);
  }
  return errorResponse("DELIVERY_UNAVAILABLE", "A kézbesítési napló átmenetileg nem érhető el.", 503);
}
