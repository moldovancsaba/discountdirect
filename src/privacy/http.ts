import { errorResponse } from "@/auth/http";
import { PrivacyError } from "./service";

export function privacyError(error: unknown) {
  if (error instanceof PrivacyError) {
    const map = {
      FORBIDDEN: ["FORBIDDEN", "Ehhez az eladóhoz nincs hozzáférésed.", 403],
      NOT_FOUND: ["NOT_FOUND", "A keresett adatkezelési rekord nem található.", 404],
      INVALID: ["INVALID_PRIVACY_REQUEST", "Az adatkezelési kérés érvénytelen.", 400],
      CONFLICT: ["PRIVACY_CONFLICT", "A művelet ebben az állapotban nem hajtható végre.", 409],
      UNAVAILABLE: ["PRIVACY_UNAVAILABLE", "Az adatkezelési szolgáltatás átmenetileg nem érhető el.", 503],
    } as const;
    const [code, message, status] = map[error.code];
    return errorResponse(code, message, status);
  }
  return errorResponse("PRIVACY_UNAVAILABLE", "Az adatkezelési szolgáltatás átmenetileg nem érhető el.", 503);
}
