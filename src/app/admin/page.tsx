import type { Metadata } from "next";
import { AuthShell, BannerNotice, Button as GdsButton, GdsGrid, GdsIcon, MetricCard, PageHeader, PasswordInput, SectionPanel, SimpleDataTable, StatusBadge, TextInput } from "@discountdirect/gds-client";
import { Shell } from "@/components/shell";
import { isOperator } from "@/lib/operations";
import { validSecret } from "@/lib/operator-session";
import { databaseHealth } from "@/lib/database";
import { deliverySummary } from "@/delivery/service";
import { automationSummary } from "@/automations/service";
import { redemptionSummary } from "@/redemptions/service";
import { adminAccessOverview } from "@/auth/admin-access";
import { disableUserAction, revokeBuyerRelationshipAction, revokeMembershipAction, revokeUserSessionsAction, signIn, signOut } from "./actions";

export const metadata: Metadata = { title: "Rendszerállapot", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
const savedMessages: Record<string, string> = {
  "sessions-revoked": "A felhasználó aktív munkamenetei visszavonva.",
  "user-disabled": "A felhasználó letiltva és a munkamenetei visszavonva.",
  "membership-revoked": "Az eladói hozzáférés visszavonva.",
  "relationship-revoked": "A vásárlói kapcsolat visszavonva.",
};
const statusTone: Record<string, "success" | "warning" | "neutral" | "danger" | "info"> = {
  active: "success",
  pending: "warning",
  disabled: "danger",
  revoked: "neutral",
};
function ReasonAction({ id, action, label, tone = "default" }: { id: string; action: (id: string, form: FormData) => void | Promise<void>; label: string; tone?: "default" | "red" }) {
  return <form action={action.bind(null, id)}>
    <TextInput name="reason" label="Indok" required minLength={8} maxLength={240} placeholder="Audithoz rögzített indok" />
    <GdsButton type="submit" variant={tone === "red" ? "filled" : "default"} color={tone === "red" ? "red" : undefined}>{label}</GdsButton>
  </form>;
}
export default async function Admin({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const authorized = await isOperator();
  const configured = validSecret(process.env.OPERATIONS_TOKEN);
  const { error, saved } = await searchParams;
  if (!authorized) return <Shell active="admin">
    <AuthShell title="Üzemeltetői hozzáférés" description="Védett áttekintés az alkalmazás működéséről." intent="sign-in" brand={<GdsIcon name="Lock" size="lg" decorative />} error={error ? "A hozzáférési kulcs nem megfelelő." : undefined} helper="A munkamenet egy óra után lejár.">
      {configured ? <form action={signIn}>
        <PasswordInput name="token" label="Hozzáférési kulcs" autoComplete="current-password" required maxLength={1024} />
        <GdsButton type="submit" fullWidth leftSection={<GdsIcon name="Login" decorative />}>Biztonságos belépés</GdsButton>
      </form> : <BannerNotice title="Beállítás folyamatban" severity="warning" message="Az üzemeltetői hozzáférés még nincs beállítva." />}
    </AuthShell>
  </Shell>;

  const [database, deliveries, automations, redemptions, access] = await Promise.all([
    databaseHealth(),
    deliverySummary(),
    automationSummary(),
    redemptionSummary(),
    adminAccessOverview(),
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
    {saved && savedMessages[saved] ? <BannerNotice severity="success" variant="compact" message={savedMessages[saved]} /> : null}
    {error ? <BannerNotice severity="error" variant="compact" message="A hozzáférési művelet nem hajtható végre. Ellenőrizd az indokot és a cél azonosítóját." /> : null}
    <GdsGrid columns={{ base: 1, md: 3 }}>
      <MetricCard label="MongoDB Atlas" value={database.connected ? "Kapcsolódva" : "Nincs kapcsolat"} trend={{ label: database.connected ? "Üzemkész" : "Hiba", tone: database.connected ? "positive" : "negative" }} description="Az adatbázis válasza alapján" icon={<GdsIcon name="Connectivity" decorative />} />
      <MetricCard label="Adatbázis válaszideje" value={database.latencyMs === null ? "Nem elérhető" : `${database.latencyMs} ms`} description="Kapcsolódás és állapotellenőrzés" icon={<GdsIcon name="Time" decorative />} />
      <MetricCard label="Kézbesítési rekordok" value={String(deliveryTotal)} description={`${deliveries.unsupported ?? 0} nincs szolgáltató · ${deliveries.suppressed ?? 0} letiltott`} icon={<GdsIcon name="Send" decorative />} />
      <MetricCard label="Aktív automatizmusok" value={String(automations.automations.active ?? 0)} description={`${automations.runs.completed ?? 0} sikeres futás · ${automations.activeLists} aktív lista`} icon={<GdsIcon name="Calendar" decorative />} />
      <MetricCard label="Kuponok" value={String(couponTotal)} description={`${redemptions.issued ?? 0} kiadva · ${redemptions.redeemed ?? 0} beváltva`} icon={<GdsIcon name="Tag" decorative />} />
      <MetricCard label="Aktív felhasználók" value="Még nincs mérés" description="A jelenlétkövetés a valós idejű funkciókkal érkezik." icon={<GdsIcon name="Users" decorative />} />
    </GdsGrid>
    <SectionPanel title="Kiadás: 1.5.0" description="GDS 6.7.0, produkciós realtime próba, auditált hozzáférés-visszavonás, tartós kézbesítési napló és egyszer használható kuponok." action={<GdsButton component="a" href="/admin" leftSection={<GdsIcon name="Refresh" decorative />}>Állapot frissítése</GdsButton>}>
      <StatusBadge status="success" withIcon>Production</StatusBadge>
    </SectionPanel>
    <SectionPanel title="Hozzáférések és munkamenetek" description="Operátori revokációs felület auditnaplóval. A műveletek növelik az authVersion értéket és visszavonják a nyitott munkameneteket.">
      <div className="table-wrap"><SimpleDataTable rows={access.users.map((user) => ({
        user: `${user.displayName} · ${user.email}`,
        status: <StatusBadge status={statusTone[user.status] ?? "neutral"}>{user.status}</StatusBadge>,
        role: user.systemRole ?? "—",
        sessions: String(user.activeSessions),
        lastSeen: user.lastSeenAt ? new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Budapest" }).format(new Date(user.lastSeenAt)) : "—",
        revoke: <ReasonAction id={user.id} action={revokeUserSessionsAction} label="Munkamenetek visszavonása" />,
        disable: user.status !== "disabled" ? <ReasonAction id={user.id} action={disableUserAction} label="Felhasználó tiltása" tone="red" /> : "—",
      }))} columns={[{ key: "user", header: "Felhasználó" }, { key: "status", header: "Állapot" }, { key: "role", header: "Rendszerszerep" }, { key: "sessions", header: "Aktív session" }, { key: "lastSeen", header: "Utolsó aktivitás" }, { key: "revoke", header: "Session revokáció" }, { key: "disable", header: "Felhasználó tiltása" }]} /></div>
    </SectionPanel>
    <SectionPanel title="Eladói hozzáférések" description="Tagság visszavonásakor a felhasználó nyitott munkamenetei is megszűnnek.">
      <div className="table-wrap"><SimpleDataTable rows={access.memberships.map((membership) => ({
        user: `${membership.displayName} · ${membership.email}`,
        seller: membership.sellerName,
        role: membership.role,
        status: <StatusBadge status={statusTone[membership.status] ?? "neutral"}>{membership.status}</StatusBadge>,
        action: membership.status === "active" ? <ReasonAction id={membership.id} action={revokeMembershipAction} label="Tagság visszavonása" tone="red" /> : "—",
      }))} columns={[{ key: "user", header: "Felhasználó" }, { key: "seller", header: "Eladó" }, { key: "role", header: "Szerep" }, { key: "status", header: "Állapot" }, { key: "action", header: "Művelet" }]} /></div>
    </SectionPanel>
    <SectionPanel title="Vásárlói kapcsolatok" description="Kapcsolat visszavonásakor a vásárló nyitott munkamenetei is megszűnnek.">
      <div className="table-wrap"><SimpleDataTable rows={access.relationships.map((relationship) => ({
        user: `${relationship.displayName} · ${relationship.email}`,
        seller: relationship.sellerName,
        status: <StatusBadge status={statusTone[relationship.status] ?? "neutral"}>{relationship.status}</StatusBadge>,
        action: relationship.status === "active" ? <ReasonAction id={relationship.id} action={revokeBuyerRelationshipAction} label="Kapcsolat visszavonása" tone="red" /> : "—",
      }))} columns={[{ key: "user", header: "Vásárló" }, { key: "seller", header: "Eladó" }, { key: "status", header: "Állapot" }, { key: "action", header: "Művelet" }]} /></div>
    </SectionPanel>
    <SectionPanel title="Hozzáférési audit" description="A legutóbbi operátori revokációk és tiltások.">
      <div className="table-wrap"><SimpleDataTable rows={access.events.map((event) => ({
        when: new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Budapest" }).format(new Date(event.occurredAt)),
        actor: event.actor,
        action: event.action,
        target: event.target,
        reason: event.reason,
      }))} columns={[{ key: "when", header: "Időpont" }, { key: "actor", header: "Operátor" }, { key: "action", header: "Művelet" }, { key: "target", header: "Cél" }, { key: "reason", header: "Indok" }]} /></div>
    </SectionPanel>
  </Shell>;
}
