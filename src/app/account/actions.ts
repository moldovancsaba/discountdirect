"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revokeSession, USER_SESSION_COOKIE } from "@/auth/service";

export async function signOutUser() {
  const cookieStore = await cookies();
  await revokeSession(cookieStore.get(USER_SESSION_COOKIE)?.value);
  cookieStore.delete(USER_SESSION_COOKIE);
  redirect("/sign-in");
}
