import "server-only";
import { cookies } from "next/headers";
import { resolveSession, USER_SESSION_COOKIE } from "@/auth/service";

export type OperatorActor = {
  authorized: boolean;
  actorKind: "operator_user";
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
      return { authorized: false, actorKind: "operator_user", actorUserId: null, actorLabel: "session-unavailable" };
    }
  }
  return { authorized: false, actorKind: "operator_user", actorUserId: null, actorLabel: "unauthenticated" };
}

export async function isOperator() {
  return (await operatorIdentity()).authorized;
}
