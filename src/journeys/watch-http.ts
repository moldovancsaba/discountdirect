import { errorResponse } from "@/auth/http";
import { ProductWatchError } from "./watch-service";

export function productWatchError(error: unknown) {
  if (error instanceof ProductWatchError) {
    const map = {
      NOT_FOUND: ["NOT_FOUND", "A termék vagy az eladó nem található.", 404],
      FORBIDDEN: ["FORBIDDEN", "Ehhez a termékfigyeléshez nincs hozzáférésed.", 403],
      INVALID: ["INVALID_WATCH", "A termékfigyelési kérés érvénytelen.", 400],
      CONFLICT: ["STALE_WATCH", "A termékfigyelés időközben megváltozott.", 409],
    } as const;
    const [code, message, status] = map[error.code];
    return errorResponse(code, message, status);
  }
  return errorResponse("WATCH_UNAVAILABLE", "A termékfigyelés átmenetileg nem érhető el.", 503);
}
