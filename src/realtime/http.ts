import { errorResponse } from "@/auth/http";
import { RealtimeError } from "./service";

export function realtimeError(error: unknown) {
  if (error instanceof RealtimeError) {
    const map = {
      DISABLED: ["REALTIME_DISABLED", "Az élő frissítés jelenleg kikapcsolva van. Az üzenetek mentése továbbra is elérhető.", 503],
      INVALID: ["INVALID_REALTIME", "Az élő frissítési kérés érvénytelen.", 400],
      FORBIDDEN: ["FORBIDDEN", "Ehhez a beszélgetéshez nincs hozzáférésed.", 403],
      NOT_FOUND: ["NOT_FOUND", "A keresett beszélgetés nem található.", 404],
    } as const;
    const [code, message, status] = map[error.code];
    return errorResponse(code, message, status);
  }
  return errorResponse("REALTIME_UNAVAILABLE", "Az élő frissítés átmenetileg nem érhető el. Az üzenetek tartósan mentve maradnak.", 503);
}
