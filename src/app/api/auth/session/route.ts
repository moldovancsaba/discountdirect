import { NextResponse } from "next/server";
import {
  authenticate,
  AuthError,
  revokeSession,
  USER_SESSION_COOKIE,
} from "@/auth/service";
import {
  clientAddress,
  errorResponse,
  hasAcceptableJsonBody,
  isSameOrigin,
} from "@/auth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const { email, password } = (body ?? {}) as Record<string, unknown>;
  if (typeof email !== "string" || typeof password !== "string") {
    return errorResponse(
      "INVALID_REQUEST",
      "Az e-mail-cím és a jelszó kötelező.",
      400,
    );
  }
  try {
    const result = await authenticate(
      email,
      password,
      clientAddress(request),
      request.headers.get("user-agent") ?? "unknown",
    );
    const response = NextResponse.json(
      { authenticated: true },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(USER_SESSION_COOKIE, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: result.maxAge,
    });
    return response;
  } catch (error) {
    if (error instanceof AuthError && error.code === "RATE_LIMITED")
      return errorResponse(
        "RATE_LIMITED",
        "Túl sok próbálkozás. Próbáld újra később.",
        429,
      );
    if (error instanceof AuthError)
      return errorResponse(
        "INVALID_CREDENTIALS",
        "Hibás e-mail-cím vagy jelszó.",
        401,
      );
    return errorResponse(
      "AUTH_UNAVAILABLE",
      "A bejelentkezés átmenetileg nem érhető el.",
      503,
    );
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request))
    return errorResponse(
      "INVALID_ORIGIN",
      "A kérés eredete nem engedélyezett.",
      403,
    );
  const token = request.headers
    .get("cookie")
    ?.match(/(?:^|; )discountdirect-session=([^;]+)/)?.[1];
  try {
    await revokeSession(token ? decodeURIComponent(token) : undefined);
  } catch {
    return errorResponse(
      "AUTH_UNAVAILABLE",
      "A kijelentkezés átmenetileg nem érhető el.",
      503,
    );
  }
  const response = new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
  response.cookies.delete(USER_SESSION_COOKIE);
  return response;
}
