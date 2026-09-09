import { errorResponse } from "@/auth/http";
import { MessagingError } from "./service";

export function messagingError(error: unknown) {
  if (error instanceof MessagingError) {
    const map = {
      FORBIDDEN: ["FORBIDDEN", "Ehhez a beszélgetéshez nincs hozzáférésed.", 403],
      NOT_FOUND: ["NOT_FOUND", "A keresett beszélgetés nem található.", 404],
      INVALID: ["INVALID_CONVERSATION", "A beszélgetési kérés érvénytelen.", 400],
    } as const;
    const [code, message, status] = map[error.code];
    return errorResponse(code, message, status);
  }
  return errorResponse("MESSAGING_UNAVAILABLE", "Az üzenetek átmenetileg nem érhetők el.", 503);
}
