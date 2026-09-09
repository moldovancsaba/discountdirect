import { activateWithToken, AuthError } from "@/auth/service";
import {
  errorResponse,
  hasAcceptableJsonBody,
  isSameOrigin,
} from "@/auth/http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return errorResponse(
      "INVALID_ORIGIN",
      "A kérés eredete nem engedélyezett.",
      403,
    );
  if (!hasAcceptableJsonBody(request))
    return errorResponse("INVALID_REQUEST", "Érvénytelen kérés.", 400);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_REQUEST", "Érvénytelen kérés.", 400);
  }
  const { token, password } = (body ?? {}) as Record<string, unknown>;
  if (typeof token !== "string" || typeof password !== "string")
    return errorResponse(
      "INVALID_REQUEST",
      "A token és a jelszó kötelező.",
      400,
    );
  try {
    await activateWithToken(token, password);
    return Response.json(
      { activated: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthError)
      return errorResponse(
        "INVALID_TOKEN",
        "A hivatkozás érvénytelen vagy lejárt.",
        400,
      );
    if (error instanceof Error && error.message === "INVALID_PASSWORD")
      return errorResponse(
        "INVALID_PASSWORD",
        "A jelszó 12–128 karakter legyen.",
        400,
      );
    return errorResponse(
      "AUTH_UNAVAILABLE",
      "Az aktiválás átmenetileg nem érhető el.",
      503,
    );
  }
}
