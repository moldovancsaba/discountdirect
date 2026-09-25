import { errorResponse } from "@/auth/http";
import { MembershipError } from "./service";

export function membershipError(error: unknown) {
  if (error instanceof MembershipError) {
    const map = { NOT_FOUND: ["NOT_FOUND", "Az eladó nem található.", 404], FORBIDDEN: ["FORBIDDEN", "Ehhez az eladóhoz nincs jogosultságod.", 403], CONFLICT: ["MEMBERSHIP_CONFLICT", "A tagsági állapot időközben megváltozott.", 409] } as const;
    const [code, message, status] = map[error.code];
    return errorResponse(code, message, status);
  }
  return errorResponse("MEMBERSHIP_UNAVAILABLE", "A tagság átmenetileg nem érhető el.", 503);
}
