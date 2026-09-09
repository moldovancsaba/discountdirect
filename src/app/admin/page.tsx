import type { Metadata } from "next";
import { AuthShell, BannerNotice, Button as GdsButton, GdsGrid, GdsIcon, MetricCard, PageHeader, PasswordInput, SectionPanel, StatusBadge } from "@discountdirect/gds-client";
import { Shell } from "@/components/shell";
import { isOperator } from "@/lib/operations";
import { validSecret } from "@/lib/operator-session";
import { databaseHealth } from "@/lib/database";
import { signIn, signOut } from "./actions";

export const metadata: Metadata = { title: "Rendszerállapot", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function Admin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const authorized = await isOperator();
  const configured = validSecret(process.env.OPERATIONS_TOKEN);
  const { error } = await searchParams;
  if (!authorized) return <Shell active="admin">
    <AuthShell title="Üzemeltetői hozzáférés" description="Védett áttekintés az alkalmazás működéséről." intent="sign-in" brand={<GdsIcon name="Lock" size="lg" decorative />} error={error ? "A hozzáférési kulcs nem megfelelő." : undefined} helper="A munkamenet egy óra után lejár.">
      {configured ? <form action={signIn}>
        <PasswordInput name="token" label="Hozzáférési kulcs" autoComplete="current-password" required maxLength={1024} />
        <GdsButton type="submit" fullWidth leftSection={<GdsIcon name="Login" decorative />}>Biztonságos belépés</GdsButton>
      </form> : <BannerNotice title="Beállítás folyamatban" severity="warning" message="Az üzemeltetői hozzáférés még nincs beállítva." />}
    </AuthShell>
  </Shell>;

  const database = await databaseHealth();
  const checkedAt = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "medium", timeZone: "Europe/Budapest" }).format(new Date());
  return <Shell active="admin">
    <PageHeader
      title="Rendszerállapot"
      description={`Élő ellenőrzés · ${checkedAt}`}
      eyebrow="Üzemeltetés"
      actions={<form action={signOut}><GdsButton type="submit" variant="default" leftSection={<GdsIcon name="Logout" decorative />}>Kilépés</GdsButton></form>}
    />
    <GdsGrid columns={{ base: 1, md: 3 }}>
      <MetricCard label="MongoDB Atlas" value={database.connected ? "Kapcsolódva" : "Nincs kapcsolat"} trend={{ label: database.connected ? "Üzemkész" : "Hiba", tone: database.connected ? "positive" : "negative" }} description="Az adatbázis válasza alapján" icon={<GdsIcon name="Connectivity" decorative />} />
      <MetricCard label="Adatbázis válaszideje" value={database.latencyMs === null ? "Nem elérhető" : `${database.latencyMs} ms`} description="Kapcsolódás és állapotellenőrzés" icon={<GdsIcon name="Time" decorative />} />
      <MetricCard label="Aktív felhasználók" value="Még nincs mérés" description="A jelenlétkövetés a valós idejű funkciókkal érkezik." icon={<GdsIcon name="Users" decorative />} />
    </GdsGrid>
    <SectionPanel title="Kiadás: 1.1.0" description="GDS 6.7.0, tartós beszélgetések és ellenőrizhető, fokozatosan engedélyezhető élő frissítés." action={<GdsButton component="a" href="/admin" leftSection={<GdsIcon name="Refresh" decorative />}>Állapot frissítése</GdsButton>}>
      <StatusBadge status="success" withIcon>Production</StatusBadge>
    </SectionPanel>
  </Shell>;
}
