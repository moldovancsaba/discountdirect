import { errorResponse } from "@/auth/http";
import { SettingsError } from "./service";

export function settingsError(error: unknown) {
  if (error instanceof SettingsError) {
    const map = {
      FORBIDDEN: ["FORBIDDEN", "Ehhez a beállításhoz nincs jogosultságod.", 403],
      NOT_FOUND: ["NOT_FOUND", "Az eladó nem található.", 404],
      VALIDATION: ["VALIDATION", "A beállítások érvénytelen kulcsot vagy értéket tartalmaznak.", 400],
      STALE: ["STALE_VERSION", "A beállítások időközben megváltoztak. Frissítsd az oldalt.", 409],
    } as const;
    const [code, message, status] = map[error.code];
    return errorResponse(code, message, status);
  }
  return errorResponse("SETTINGS_UNAVAILABLE", "A beállítások átmenetileg nem érhetők el.", 503);
}
