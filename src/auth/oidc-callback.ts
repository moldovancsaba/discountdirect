import "server-only";
import { NextResponse } from "next/server";
import { completeSsoCallback, SsoError } from "./oidc";
import { USER_SESSION_COOKIE } from "./service";

export async function handleSsoCallback(request: Request, callback: 1 | 2) {
  const url = new URL(request.url);
  try {
    const result = await completeSsoCallback({
      callback,
      code: url.searchParams.get("code"),
      state: url.searchParams.get("state"),
      providerError: url.searchParams.get("error"),
      userAgent: request.headers.get("user-agent") ?? "unknown",
    });
    const response = NextResponse.redirect(new URL(result.returnTo, request.url));
    response.cookies.set(USER_SESSION_COOKIE, result.session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: result.session.maxAge,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const reason =
      error instanceof SsoError && error.code === "ACCESS_DENIED"
        ? "sso_denied"
        : error instanceof SsoError && error.code === "ACCOUNT_DISABLED"
          ? "sso_disabled"
          : error instanceof SsoError && error.code === "CONFIGURATION"
            ? "sso_unavailable"
            : "sso_failed";
    return NextResponse.redirect(new URL(`/sign-in?error=${reason}`, request.url));
  }
}
