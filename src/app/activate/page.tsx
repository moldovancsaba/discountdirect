import type { Metadata } from "next";
import { AuthShell, Button as GdsButton, GdsIcon, PasswordInput, StateBlock } from "@discountdirect/gds-client";
import { Shell } from "@/components/shell";
import { activate } from "./actions";

export const metadata: Metadata = { title: "Fiók aktiválása", robots: { index: false, follow: false } };
export default async function ActivatePage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token = "", error } = await searchParams;
  const message = error === "password" ? "A két jelszó egyezzen, és legalább 12 karakter legyen." : error === "token" ? "A hivatkozás érvénytelen, lejárt vagy már felhasználták." : error ? "Az aktiválás átmenetileg nem érhető el." : null;
  return <Shell>
    <AuthShell title="Állíts be új jelszót" description="Egyszer használatos fiókaktiválás" intent="account-linking" brand={<GdsIcon name="Key" size="lg" decorative />} error={message} helper="A hivatkozás felhasználás után érvényét veszti. A jelszó 12–128 karakter hosszú legyen.">
      {token ? <form action={activate.bind(null, token)}>
        <PasswordInput name="password" label="Új jelszó" autoComplete="new-password" required minLength={12} maxLength={128} />
        <PasswordInput name="confirmation" label="Jelszó újra" autoComplete="new-password" required minLength={12} maxLength={128} />
        <GdsButton type="submit" fullWidth leftSection={<GdsIcon name="Verify" decorative />}>Fiók aktiválása</GdsButton>
      </form> : <StateBlock variant="error" title="Az aktiváló hivatkozás hiányos" description={message ?? "Az aktiváló hivatkozásból hiányzik a token."} />}
    </AuthShell>
  </Shell>;
}
