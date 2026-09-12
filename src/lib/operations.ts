import "server-only";
import { cookies } from "next/headers";
import { resolveSession, USER_SESSION_COOKIE } from "@/auth/service";
import { SESSION_COOKIE, verifySession } from "./operator-session";

export type OperatorActor = {
  authorized: boolean;
  actorKind: "operator_user" | "operator_token";
  actorUserId: string | null;
  actorLabel: string;
};

export async function operatorIdentity(): Promise<OperatorActor> {
  const cookieStore = await cookies();
  const identityToken = cookieStore.get(USER_SESSION_COOKIE)?.value;
  if (identityToken) {
    try {
      const user = await resolveSession(identityToken);
      if (user?.systemRole === "operator")
        return { authorized: true, actorKind: "operator_user", actorUserId: user.id, actorLabel: user.email };
    } catch {
      // Keep the independent emergency operator gate available during a database outage.
    }
  }
  const emergency = verifySession(
    cookieStore.get(SESSION_COOKIE)?.value,
    process.env.OPERATIONS_TOKEN,
  );
  return { authorized: emergency, actorKind: "operator_token", actorUserId: null, actorLabel: "operations-token" };
}

export async function isOperator() {
  return (await operatorIdentity()).authorized;
}
