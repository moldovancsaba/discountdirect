import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BannerNotice, Button as GdsButton, GdsIcon, PageHeader, SectionPanel, StatusBadge } from "@discountdirect/gds-client";
import { buyerRelationshipsFor, currentUser, membershipsFor } from "@/auth/service";
import { platformRoles } from "@/auth/roles-core";
import { Shell } from "@/components/shell";
import { signOutUser } from "./actions";

export const metadata: Metadata = { title: "Saját munkaterület", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function formatDate(value: Date | null) {
  return value ? new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Budapest" }).format(new Date(value)) : "-";
}

export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const [memberships, relationships] = await Promise.all([membershipsFor(user.id), buyerRelationshipsFor(user.id)]);
  const roles = platformRoles({ systemRole: user.systemRole, membershipRoles: memberships.map((membership) => membership.role), hasBuyerRelationship: relationships.length > 0 });
  return <Shell active="account">
    <PageHeader
      title="Saját munkatér"
      description="SSO-identitás, eladói hozzáférések, vásárlói kapcsolatok és operátori jogosultság."
      eyebrow={user.displayName}
      actions={<form action={signOutUser}><GdsButton type="submit" variant="default" leftSection={<GdsIcon name="Logout" decorative />}>Kijelentkezés</GdsButton></form>}
    />
    <SectionPanel title="SSO profil" description="A DiscountDirect ezt az identitást kapta a DoneIsBetter SSO-tól.">
      <div className="profile-grid">
        <div><strong>E-mail</strong><span>{user.email}</span></div>
        <div><strong>Név</strong><span>{user.displayName}</span></div>
        <div><strong>SSO szerep</strong><span>{user.ssoRole ?? "user"}</span></div>
        <div><strong>SSO státusz</strong><span><StatusBadge status={user.ssoStatus === "approved" ? "success" : "warning"}>{user.ssoStatus ?? "unknown"}</StatusBadge></span></div>
        <div><strong>Rendszerszerep</strong><span>{user.systemRole ?? "-"}</span></div>
        <div><strong>DiscountDirect szerepek</strong><span>{roles.join(", ") || "-"}</span></div>
        <div><strong>Utolsó SSO belépés</strong><span>{formatDate(user.lastSsoLoginAt)}</span></div>
      </div>
    </SectionPanel>
    <SectionPanel title="Eladói hozzáférések" description={`${memberships.length} aktív eladói munkatér.`}>
      <div className="action-list">
        {memberships.map((membership) => <div className="action-list-row" key={membership.id}>
          <span><strong>{membership.name}</strong><p>{membership.role === "owner" ? "Tulajdonos" : "Munkatárs"} · {membership.sellerStatus}</p></span>
          <GdsButton component="a" href={`/seller/${membership.slug}`} leftSection={<GdsIcon name="Launch" decorative />}>Megnyitás</GdsButton>
        </div>)}
        {!memberships.length ? <BannerNotice variant="compact" severity="info" message="Nincs aktív eladói hozzáférés." /> : null}
      </div>
    </SectionPanel>
    <SectionPanel title="Vásárlói kapcsolatok" description={`${relationships.length} aktív vásárlói kapcsolat.`}>
      <div className="action-list">
        {relationships.map((relationship) => <div className="action-list-row" key={relationship.id}>
          <span><strong>{relationship.name}</strong><p>{relationship.sellerStatus}</p></span>
          <div className="button-row"><GdsButton component="a" href="/buyer" leftSection={<GdsIcon name="Launch" decorative />}>Központ</GdsButton><GdsButton component="a" href={`/buyer/${relationship.slug}`} variant="default" leftSection={<GdsIcon name="History" decorative />}>Kapcsolat</GdsButton></div>
        </div>)}
        {!relationships.length ? <BannerNotice variant="compact" severity="info" message="Nincs aktív vásárlói kapcsolat." /> : null}
      </div>
    </SectionPanel>
    {user.systemRole === "operator" ? <SectionPanel title="Üzemeltetés" description="Felhasználói hozzáférések, munkamenetek és rendszerállapot.">
      <div className="action-list-row">
        <span><strong>Operátori felület</strong><p>Csak jóváhagyott SSO admin/operator szereppel érhető el.</p></span>
        <GdsButton component="a" href="/admin" leftSection={<GdsIcon name="Analytics" decorative />}>Megnyitás</GdsButton>
      </div>
    </SectionPanel> : null}
    {!memberships.length && !relationships.length && !user.systemRole ? <BannerNotice title="Nincs hozzárendelt munkaterület" severity="info" message="A fiók aktív, de még nincs hozzárendelt munkaterület. Kérd az üzemeltető segítségét." /> : null}
  </Shell>;
}
