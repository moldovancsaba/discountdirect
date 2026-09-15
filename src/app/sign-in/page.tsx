import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell, Button as GdsButton, GdsIcon } from "@discountdirect/gds-client";
import { currentUser } from "@/auth/service";
import { safeReturnTo } from "@/auth/oauth-flow";
import { Shell } from "@/components/shell";

export const metadata: Metadata = { title: "Bejelentkezés", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
const messages = { sso_denied: "Az SSO-hozzáférést megszakították, elutasították vagy nincs jóváhagyva ehhez az alkalmazáshoz.", sso_disabled: "Ez a DiscountDirect-fiók le van tiltva.", sso_failed: "Az SSO-bejelentkezés nem ellenőrizhető. Próbáld újra.", sso_unavailable: "Az SSO-bejelentkezés átmenetileg nem érhető el." };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; returnTo?: string }> }) {
  const { error, returnTo } = await searchParams;
  const nextPath = safeReturnTo(returnTo);
  if (await currentUser()) redirect(nextPath);
  const message = error && messages[error as keyof typeof messages];
  return <Shell active="sign-in">
    <AuthShell
      title="Bejelentkezés"
      description="A saját eladói vagy vásárlói munkaterületedhez."
      intent="sign-in"
      brand={<GdsIcon name="Lock" size="lg" decorative />}
      error={message}
      helper="A munkamenet 30 perc tétlenség vagy legfeljebb 12 óra után lejár."
    >
      <GdsButton component="a" href={`/api/auth/login?returnTo=${encodeURIComponent(nextPath)}`} fullWidth leftSection={<GdsIcon name="Login" decorative />}>Bejelentkezés DoneIsBetter SSO-val</GdsButton>
    </AuthShell>
  </Shell>;
}
