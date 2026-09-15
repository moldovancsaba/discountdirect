import { Button as GdsButton, GdsIcon, StatusBadge } from "@discountdirect/gds-client";
import { currentUser } from "@/auth/service";
import { Shell } from "@/components/shell";

const workAreas = [
  {
    title: "Eladói munka",
    description: "Katalógus, vásárlói főkönyv, ajánlási előnézet, kampány, automatizmus.",
    href: "/account",
    icon: "Users",
  },
  {
    title: "Vásárlói munka",
    description: "Ajánlatok, ajánlatlisták, beszélgetések, kuponok és csatornaállapotok.",
    href: "/buyer",
    icon: "Tag",
  },
  {
    title: "Üzemeltetés",
    description: "Felhasználók, munkamenetek, hozzáférések, kézbesítés és rendszerállapot.",
    href: "/admin",
    icon: "Analytics",
  },
] as const;

export default async function Home() {
  const user = await currentUser().catch(() => null);
  return (
    <Shell>
      <section className="workspace-header">
        <div>
          <p className="workspace-eyebrow">DiscountDirect</p>
          <h1>Munkaasztal</h1>
          <p>Belépés után csak azok a műveletek látszanak, amelyekhez van jogosultságod.</p>
        </div>
        <div className="workspace-actions">
          {user ? <StatusBadge status="success" withIcon>{user.email}</StatusBadge> : null}
          <GdsButton component="a" href={user ? "/account" : "/sign-in"} leftSection={<GdsIcon name="Login" decorative />}>
            {user ? "Munkatér megnyitása" : "Bejelentkezés SSO-val"}
          </GdsButton>
        </div>
      </section>
      <section className="workspace-grid">
        {workAreas.map((area) => (
          <a className="workspace-tile" href={area.href} key={area.title}>
            <GdsIcon name={area.icon} decorative />
            <span>
              <strong>{area.title}</strong>
              <small>{area.description}</small>
            </span>
          </a>
        ))}
      </section>
      <section className="workspace-panel">
        <div className="workspace-panel-head">
          <h2>Aktív üzleti folyamatok</h2>
          <StatusBadge status="info">SSO-val védve</StatusBadge>
        </div>
        <div className="workflow-list">
          <div><strong>Katalógus és vásárlói főkönyv</strong><span>Termékek, vásárlások, hozzájárulások és adatkezelési kérelmek.</span></div>
          <div><strong>Ajánlat és kampány</strong><span>Bizonyíték-alapú ajánlási előnézetből induló személyes vagy villám ajánlat.</span></div>
          <div><strong>Beszélgetés és beváltás</strong><span>Üzenetfolyam, ajánlatdöntés, kuponkód és eladói megerősítés.</span></div>
        </div>
      </section>
    </Shell>
  );
}
