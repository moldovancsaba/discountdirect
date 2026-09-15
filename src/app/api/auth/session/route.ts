import { NextResponse } from "next/server";
import { revokeSession, USER_SESSION_COOKIE } from "@/auth/service";
import { errorResponse, isSameOrigin } from "@/auth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return errorResponse(
      "INVALID_ORIGIN",
      "A kérés eredete nem engedélyezett.",
      403,
    );
  return errorResponse(
    "SSO_ONLY",
    "A bejelentkezés csak DoneIsBetter SSO-val érhető el.",
    410,
  );
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
