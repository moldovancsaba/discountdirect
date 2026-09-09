"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticate, AuthError, USER_SESSION_COOKIE } from "@/auth/service";

export async function signIn(form: FormData) {
  const email = form.get("email");
  const password = form.get("password");
  if (typeof email !== "string" || typeof password !== "string")
    redirect("/sign-in?error=invalid");
  const requestHeaders = await headers();
  let result: Awaited<ReturnType<typeof authenticate>>;
  try {
    result = await authenticate(
      email,
      password,
      (requestHeaders.get("x-forwarded-for")?.split(",")[0] ?? "unknown")
        .trim()
        .slice(0, 64),
      requestHeaders.get("user-agent") ?? "unknown",
    );
  } catch (error) {
    if (error instanceof AuthError && error.code === "RATE_LIMITED")
      redirect("/sign-in?error=limited");
    if (error instanceof AuthError) redirect("/sign-in?error=invalid");
    redirect("/sign-in?error=unavailable");
  }
  (await cookies()).set(USER_SESSION_COOKIE, result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: result.maxAge,
  });
  redirect("/account");
}
