import { Button as GdsButton, GdsIcon, StatusBadge } from "@discountdirect/gds-client";
import { buyerRelationshipsFor, currentUser, membershipsFor } from "@/auth/service";
import { Shell } from "@/components/shell";

export default async function Home() {
  const user = await currentUser().catch(() => null);
  const [memberships, relationships] = user ? await Promise.all([membershipsFor(user.id), buyerRelationshipsFor(user.id)]) : [[], []];
  const workAreas = [
    ...memberships.map((membership) => ({ title: membership.name, description: membership.role === "owner" ? "Eladói munkatér · tulajdonos" : "Eladói munkatér · munkatárs", href: `/seller/${membership.slug}`, icon: "Users" as const })),
    ...(relationships.length ? [{ title: "Vásárlói munkatér", description: `${relationships.length} eladó ajánlatai, beszélgetései és kuponjai.`, href: "/buyer", icon: "Tag" as const }] : []),
    ...(user?.systemRole === "operator" ? [{ title: "Üzemeltetés", description: "Hozzáférések, kézbesítés és rendszerállapot.", href: "/admin", icon: "Analytics" as const }] : []),
  ];
  return (
    <Shell>
      <section className="workspace-header">
        <div>
          <p className="workspace-eyebrow">DiscountDirect</p>
          <h1>Munkaasztal</h1>
          <p>{user ? "Válaszd ki azt a munkaterületet, ahol folytatni szeretnéd." : "Jelentkezz be a saját eladói vagy vásárlói munkaterületedhez."}</p>
        </div>
        <div className="workspace-actions">
          {user ? <StatusBadge status="success" withIcon>{user.email}</StatusBadge> : null}
          <GdsButton component="a" href={user ? "/account" : "/sign-in"} leftSection={<GdsIcon name="Login" decorative />}>
            {user ? "Munkatér megnyitása" : "Bejelentkezés SSO-val"}
          </GdsButton>
        </div>
      </section>
      {workAreas.length ? <section className="workspace-grid">
        {workAreas.map((area) => (
          <a className="workspace-tile" href={area.href} key={area.title}>
            <GdsIcon name={area.icon} decorative />
            <span>
              <strong>{area.title}</strong>
              <small>{area.description}</small>
            </span>
          </a>
        ))}
      </section> : null}
      {user ? <section className="workspace-panel">
        <div className="workspace-panel-head">
          <h2>Aktív üzleti folyamatok</h2>
          <StatusBadge status="info">SSO-val védve</StatusBadge>
        </div>
        <div className="workflow-list">
          <div><strong>Katalógus és vásárlói főkönyv</strong><span>Termékek, vásárlások, hozzájárulások és adatkezelési kérelmek.</span></div>
          <div><strong>Ajánlat és kampány</strong><span>Bizonyíték-alapú ajánlási előnézetből induló személyes vagy villám ajánlat.</span></div>
          <div><strong>Beszélgetés és beváltás</strong><span>Üzenetfolyam, ajánlatdöntés, kuponkód és eladói megerősítés.</span></div>
        </div>
      </section> : null}
    </Shell>
  );
}
