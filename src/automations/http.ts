import { errorResponse } from "@/auth/http";
import { AutomationError } from "./service";

export function automationError(error: unknown) {
  if (error instanceof AutomationError) {
    const map = {
      FORBIDDEN: ["FORBIDDEN", "Ehhez az automatizmushoz nincs hozzáférésed.", 403],
      NOT_FOUND: ["NOT_FOUND", "A keresett automatizmus nem található.", 404],
      INVALID: ["INVALID_AUTOMATION", "Az automatizmus kérése érvénytelen.", 400],
      CONFLICT: ["AUTOMATION_CONFLICT", "Az automatizmus állapota időközben megváltozott.", 409],
    } as const;
    const [code, message, status] = map[error.code];
    return errorResponse(code, message, status);
  }
  return errorResponse("AUTOMATION_UNAVAILABLE", "Az automatizmusok átmenetileg nem érhetők el.", 503);
}
