import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BannerNotice, Button as GdsButton, GdsGrid, GdsIcon, ListingCard, PageHeader, SectionPanel, SimpleDataTable, StatusBadge } from "@discountdirect/gds-client";
import { buyerRelationshipsFor, currentUser, membershipsFor } from "@/auth/service";
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
  return <Shell active="account">
    <PageHeader
      title={`Üdv, ${user.displayName}!`}
      description="Csak azok a munkaterületek jelennek meg, amelyekhez aktív, szerveroldalon ellenőrzött kapcsolatod van."
      eyebrow="Saját fiók"
      actions={<form action={signOutUser}><GdsButton type="submit" variant="default" leftSection={<GdsIcon name="Logout" decorative />}>Kijelentkezés</GdsButton></form>}
    />
    <SectionPanel title="SSO profil" description="A belépett felhasználó DoneIsBetter SSO-ból szinkronizált adatai.">
      <div className="table-wrap"><SimpleDataTable rows={[{
        email: user.email,
        name: user.displayName,
        ssoRole: user.ssoRole ?? "user",
        ssoStatus: <StatusBadge status={user.ssoStatus === "approved" ? "success" : "warning"}>{user.ssoStatus ?? "unknown"}</StatusBadge>,
        systemRole: user.systemRole ?? "-",
        lastLogin: formatDate(user.lastSsoLoginAt),
      }]} columns={[{ key: "email", header: "E-mail" }, { key: "name", header: "Név" }, { key: "ssoRole", header: "SSO szerep" }, { key: "ssoStatus", header: "SSO státusz" }, { key: "systemRole", header: "Rendszerszerep" }, { key: "lastLogin", header: "Utolsó SSO belépés" }]} /></div>
    </SectionPanel>
    <GdsGrid columns={{ base: 1, md: 3 }}>
      {memberships.map((membership) => <ListingCard
        key={membership.id}
        title={membership.name}
        description={`Eladói szerepkör: ${membership.role === "owner" ? "tulajdonos" : "munkatárs"}`}
        mediaSeed={`seller-${membership.id}`}
        mediaOverlay="Eladó"
        metadata={[{ id: "access", label: "Hozzáférés", value: "Aktív" }]}
        primaryAction={<GdsButton component="a" href={`/seller/${membership.slug}`} leftSection={<GdsIcon name="Launch" decorative />}>Munkaterület megnyitása</GdsButton>}
      />)}
      {relationships.map((relationship) => <ListingCard
        key={relationship.id}
        title={relationship.name}
        description="A kereskedőhöz tartozó saját ajánlatok és vásárlási előzmények helye."
        mediaSeed={`buyer-${relationship.id}`}
        mediaOverlay="Vásárló"
        metadata={[{ id: "relationship", label: "Kapcsolat", value: "Aktív" }]}
        primaryAction={<div className="button-row"><GdsButton component="a" href="/buyer" leftSection={<GdsIcon name="Launch" decorative />}>Csatornaközpont</GdsButton><GdsButton component="a" href={`/buyer/${relationship.slug}`} variant="default" leftSection={<GdsIcon name="History" decorative />}>Kapcsolat</GdsButton><GdsButton component="a" href="/buyer/conversations" variant="default" leftSection={<GdsIcon name="Message" decorative />}>Üzenetek</GdsButton><GdsButton component="a" href="/buyer/offers" variant="default" leftSection={<GdsIcon name="Tag" decorative />}>Ajánlatok</GdsButton><GdsButton component="a" href="/buyer/lists" variant="default" leftSection={<GdsIcon name="Preview" decorative />}>Listák</GdsButton></div>}
      />)}
      {user.systemRole === "operator" ? <ListingCard
        title="Rendszerállapot"
        description="Az üzemeltetői állapot és a MongoDB Atlas kapcsolat ellenőrzése."
        mediaSeed="discountdirect-operations"
        mediaOverlay="Üzemeltető"
        primaryAction={<GdsButton component="a" href="/admin" leftSection={<GdsIcon name="Analytics" decorative />}>Állapot megnyitása</GdsButton>}
      /> : null}
    </GdsGrid>
    {!memberships.length && !relationships.length && !user.systemRole ? <BannerNotice title="Nincs hozzárendelt munkaterület" severity="info" message="A fiók aktív, de még nincs hozzárendelt munkaterület. Kérd az üzemeltető segítségét." /> : null}
  </Shell>;
}
