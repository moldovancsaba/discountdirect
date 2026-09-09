import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  buyerRelationshipsFor,
  currentUser,
  membershipsFor,
} from "@/auth/service";
import { Shell } from "@/components/shell";
import { signOutUser } from "./actions";

export const metadata: Metadata = {
  title: "Saját munkaterület",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const [memberships, relationships] = await Promise.all([
    membershipsFor(user.id),
    buyerRelationshipsFor(user.id),
  ]);
  return (
    <Shell active="account">
      <div className="section-heading">
        <div>
          <p className="eyebrow">SAJÁT FIÓK</p>
          <h1>Üdv, {user.displayName}!</h1>
        </div>
        <form action={signOutUser}>
          <button className="button button-secondary" type="submit">
            Kijelentkezés
          </button>
        </form>
      </div>
      <p className="lead">
        Csak azok a munkaterületek jelennek meg, amelyekhez aktív,
        szerveroldalon ellenőrzött kapcsolatod van.
      </p>
      <div className="feature-grid">
        {memberships.map((membership) => (
          <article className="feature-card" key={membership.id}>
            <span className="step-number">ELADÓ</span>
            <h2>{membership.name}</h2>
            <p>
              Szerepkör:{" "}
              {membership.role === "owner" ? "tulajdonos" : "munkatárs"}
            </p>
            <Link className="button" href={`/seller/${membership.slug}`}>
              Munkaterület megnyitása
            </Link>
          </article>
        ))}
        {relationships.map((relationship) => (
          <article className="feature-card" key={relationship.id}>
            <span className="step-number">VÁSÁRLÓ</span>
            <h2>{relationship.name}</h2>
            <p>
              A kereskedőhöz tartozó saját ajánlatok és beszélgetések helye.
            </p>
            <Link className="button" href={`/buyer/${relationship.slug}`}>
              Kapcsolat megnyitása
            </Link>
          </article>
        ))}
        {user.systemRole === "operator" ? (
          <article className="feature-card">
            <span className="step-number">ÜZEMELTETŐ</span>
            <h2>Rendszerállapot</h2>
            <p>
              Az üzemeltetői nézet identitásalapú hozzáférése előkészítve; az
              átállásig a külön műveleti kulcs is szükséges.
            </p>
            <Link className="button" href="/admin">
              Állapot megnyitása
            </Link>
          </article>
        ) : null}
      </div>
      {!memberships.length && !relationships.length && !user.systemRole ? (
        <div className="release-note" role="status">
          <span className="info-icon" aria-hidden="true">
            i
          </span>
          <p>
            A fiók aktív, de még nincs hozzárendelt munkaterület. Kérd az
            üzemeltető segítségét.
          </p>
        </div>
      ) : null}
    </Shell>
  );
}
