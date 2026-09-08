"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createSession,
  matchesToken,
  SESSION_COOKIE,
  SESSION_SECONDS,
} from "@/lib/operator-session";
export async function signIn(form: FormData) {
  const candidate = form.get("token");
  if (
    typeof candidate !== "string" ||
    !matchesToken(candidate, process.env.OPERATIONS_TOKEN)
  ) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    redirect("/admin?error=invalid");
  }
  (await cookies()).set(
    SESSION_COOKIE,
    createSession(process.env.OPERATIONS_TOKEN!),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_SECONDS,
    },
  );
  redirect("/admin");
}
export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/admin");
}
