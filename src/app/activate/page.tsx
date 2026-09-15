import type { Metadata } from "next";
import { AuthShell, Button as GdsButton, GdsIcon } from "@discountdirect/gds-client";
import { Shell } from "@/components/shell";

export const metadata: Metadata = { title: "Fiók aktiválása", robots: { index: false, follow: false } };
export default async function ActivatePage() {
  return <Shell>
    <AuthShell title="SSO szükséges" description="A DiscountDirect fiókokat a DoneIsBetter SSO kezeli." intent="account-linking" brand={<GdsIcon name="Lock" size="lg" decorative />} helper="Nincs külön DiscountDirect jelszó vagy aktiváló link.">
      <GdsButton component="a" href="/api/auth/login?returnTo=/account" fullWidth leftSection={<GdsIcon name="Login" decorative />}>Bejelentkezés DoneIsBetter SSO-val</GdsButton>
    </AuthShell>
  </Shell>;
}
