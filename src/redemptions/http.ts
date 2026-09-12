import { errorResponse } from "@/auth/http";
import { RedemptionError } from "./service";

export function redemptionError(error: unknown) {
  if (error instanceof RedemptionError) {
    const map = {
      FORBIDDEN: ["FORBIDDEN", "Ehhez a kuponhoz nincs hozzáférésed.", 403],
      NOT_FOUND: ["NOT_FOUND", "A kupon nem található.", 404],
      INVALID: ["INVALID_REDEMPTION", "A kuponkód érvénytelen.", 400],
      CONFLICT: ["REDEMPTION_CONFLICT", "A kupon már nem használható.", 409],
      EXPIRED: ["REDEMPTION_EXPIRED", "A kupon lejárt.", 409],
    } as const;
    const [code, message, status] = map[error.code];
    return errorResponse(code, message, status);
  }
  return errorResponse("REDEMPTION_UNAVAILABLE", "A beváltás átmenetileg nem érhető el.", 503);
}
