import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell, Button as GdsButton, GdsIcon, PasswordInput, TextInput } from "@discountdirect/gds-client";
import { currentUser } from "@/auth/service";
import { Shell } from "@/components/shell";
import { signIn } from "./actions";

export const metadata: Metadata = { title: "Bejelentkezés", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
const messages = { invalid: "Az e-mail-cím vagy a jelszó nem megfelelő.", limited: "Túl sok próbálkozás történt. Próbáld újra 15 perc múlva.", unavailable: "A bejelentkezés átmenetileg nem érhető el.", sso_denied: "Az SSO-hozzáférést megszakították vagy elutasították.", sso_disabled: "Ez a DiscountDirect-fiók le van tiltva.", sso_failed: "Az SSO-bejelentkezés nem ellenőrizhető. Próbáld újra.", sso_unavailable: "Az SSO-bejelentkezés átmenetileg nem érhető el." };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentUser()) redirect("/account");
  const { error } = await searchParams;
  const message = error && messages[error as keyof typeof messages];
  return <Shell active="sign-in">
    <AuthShell
      title="Bejelentkezés"
      description="A saját eladói vagy vásárlói munkaterületedhez."
      intent="sign-in"
      brand={<GdsIcon name="Lock" size="lg" decorative />}
      error={message}
      socialAuth={<GdsButton component="a" href="/api/auth/login?returnTo=/account" fullWidth leftSection={<GdsIcon name="Login" decorative />}>Bejelentkezés DoneIsBetter SSO-val</GdsButton>}
      dividerLabel="vagy"
      helper="A munkamenet 30 perc tétlenség vagy legfeljebb 12 óra után lejár."
    >
      <form action={signIn}>
        <TextInput name="email" type="email" label="E-mail-cím" autoComplete="username" required maxLength={254} />
        <PasswordInput name="password" label="Jelszó" autoComplete="current-password" required minLength={12} maxLength={128} aria-describedby={message ? "login-error" : undefined} />
        <GdsButton type="submit" fullWidth leftSection={<GdsIcon name="Login" decorative />}>Bejelentkezés</GdsButton>
      </form>
    </AuthShell>
  </Shell>;
}
