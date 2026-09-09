import "server-only";
import { cookies } from "next/headers";
import { resolveSession, USER_SESSION_COOKIE } from "@/auth/service";
import { SESSION_COOKIE, verifySession } from "./operator-session";
export async function isOperator() {
  const cookieStore = await cookies();
  const identityToken = cookieStore.get(USER_SESSION_COOKIE)?.value;
  if (identityToken) {
    try {
      if ((await resolveSession(identityToken))?.systemRole === "operator")
        return true;
    } catch {
      // Keep the independent emergency operator gate available during a database outage.
    }
  }
  return verifySession(
    cookieStore.get(SESSION_COOKIE)?.value,
    process.env.OPERATIONS_TOKEN,
  );
}
