import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "./operator-session";
export async function isOperator() {
  return verifySession(
    (await cookies()).get(SESSION_COOKIE)?.value,
    process.env.OPERATIONS_TOKEN,
  );
}
