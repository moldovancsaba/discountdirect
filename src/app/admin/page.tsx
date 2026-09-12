import type { Metadata } from "next";
import { AuthShell, BannerNotice, Button as GdsButton, GdsGrid, GdsIcon, MetricCard, PageHeader, PasswordInput, SectionPanel, StatusBadge } from "@discountdirect/gds-client";
import { Shell } from "@/components/shell";
import { isOperator } from "@/lib/operations";
import { validSecret } from "@/lib/operator-session";
import { databaseHealth } from "@/lib/database";
import { deliverySummary } from "@/delivery/service";
import { automationSummary } from "@/automations/service";
import { redemptionSummary } from "@/redemptions/service";
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

  const [database, deliveries, automations, redemptions] = await Promise.all([
    databaseHealth(),
    deliverySummary(),
    automationSummary(),
    redemptionSummary(),
  ]);
  const checkedAt = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "medium", timeZone: "Europe/Budapest" }).format(new Date());
  const deliveryTotal = Object.values(deliveries).reduce((sum, value) => sum + value, 0);
  const couponTotal = Object.values(redemptions).reduce((sum, value) => sum + value, 0);
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
      <MetricCard label="Kézbesítési rekordok" value={String(deliveryTotal)} description={`${deliveries.unsupported ?? 0} nincs szolgáltató · ${deliveries.suppressed ?? 0} letiltott`} icon={<GdsIcon name="Send" decorative />} />
      <MetricCard label="Aktív automatizmusok" value={String(automations.automations.active ?? 0)} description={`${automations.runs.completed ?? 0} sikeres futás · ${automations.activeLists} aktív lista`} icon={<GdsIcon name="Calendar" decorative />} />
      <MetricCard label="Kuponok" value={String(couponTotal)} description={`${redemptions.issued ?? 0} kiadva · ${redemptions.redeemed ?? 0} beváltva`} icon={<GdsIcon name="Tag" decorative />} />
      <MetricCard label="Aktív felhasználók" value="Még nincs mérés" description="A jelenlétkövetés a valós idejű funkciókkal érkezik." icon={<GdsIcon name="Users" decorative />} />
    </GdsGrid>
    <SectionPanel title="Kiadás: 1.4.0" description="GDS 6.7.0, tartós kézbesítési napló, automatizált ajánlatlisták, nyomtatható levelek és egyszer használható kuponok." action={<GdsButton component="a" href="/admin" leftSection={<GdsIcon name="Refresh" decorative />}>Állapot frissítése</GdsButton>}>
      <StatusBadge status="success" withIcon>Production</StatusBadge>
    </SectionPanel>
  </Shell>;
}
