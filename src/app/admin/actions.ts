"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { disableUserByOperator, revokeBuyerRelationshipByOperator, revokeMembershipByOperator, revokeUserSessionsByOperator } from "@/auth/admin-access";
import { revokeSession, USER_SESSION_COOKIE } from "@/auth/service";
import { operatorIdentity } from "@/lib/operations";

export async function signOut() {
  const cookieStore = await cookies();
  await revokeSession(cookieStore.get(USER_SESSION_COOKIE)?.value);
  cookieStore.delete(USER_SESSION_COOKIE);
  redirect("/admin");
}

async function actorOrThrow() {
  const actor = await operatorIdentity();
  if (!actor.authorized) throw new Error("UNAUTHORIZED");
  return actor;
}

function destination(error: unknown, saved: string) {
  if (!error) return `/admin?saved=${saved}`;
  const code = error instanceof Error ? error.message : "INVALID";
  return `/admin?error=${encodeURIComponent(code)}`;
}

export async function revokeUserSessionsAction(userId: string, form: FormData) {
  let error: unknown = null;
  try {
    await revokeUserSessionsByOperator(await actorOrThrow(), userId, form.get("reason"));
  } catch (cause) { error = cause; }
  redirect(destination(error, "sessions-revoked"));
}

export async function disableUserAction(userId: string, form: FormData) {
  let error: unknown = null;
  try {
    await disableUserByOperator(await actorOrThrow(), userId, form.get("reason"));
  } catch (cause) { error = cause; }
  redirect(destination(error, "user-disabled"));
}

export async function revokeMembershipAction(membershipId: string, form: FormData) {
  let error: unknown = null;
  try {
    await revokeMembershipByOperator(await actorOrThrow(), membershipId, form.get("reason"));
  } catch (cause) { error = cause; }
  redirect(destination(error, "membership-revoked"));
}

export async function revokeBuyerRelationshipAction(relationshipId: string, form: FormData) {
  let error: unknown = null;
  try {
    await revokeBuyerRelationshipByOperator(await actorOrThrow(), relationshipId, form.get("reason"));
  } catch (cause) { error = cause; }
  redirect(destination(error, "relationship-revoked"));
}
