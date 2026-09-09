"use server";

import { redirect } from "next/navigation";
import { activateWithToken, AuthError } from "@/auth/service";

export async function activate(form: FormData) {
  const token = form.get("token");
  const password = form.get("password");
  const confirmation = form.get("confirmation");
  if (
    typeof token !== "string" ||
    typeof password !== "string" ||
    password !== confirmation
  ) {
    redirect(
      `/activate?token=${encodeURIComponent(typeof token === "string" ? token : "")}&error=password`,
    );
  }
  try {
    await activateWithToken(token, password);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_PASSWORD") {
      redirect(`/activate?token=${encodeURIComponent(token)}&error=password`);
    }
    if (error instanceof AuthError) redirect("/activate?error=token");
    redirect("/activate?error=unavailable");
  }
  redirect("/sign-in?activated=true");
}
