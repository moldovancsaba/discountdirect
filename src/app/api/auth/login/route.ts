import { NextResponse } from "next/server";
import { beginSsoLogin } from "@/auth/oidc";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const returnTo = new URL(request.url).searchParams.get("returnTo");
    const response = NextResponse.redirect(await beginSsoLogin(returnTo, 1));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return NextResponse.redirect(new URL("/sign-in?error=sso_unavailable", request.url));
  }
}
