import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import { isOperator } from "@/lib/operations";
import { validSecret } from "@/lib/operator-session";
import { databaseHealth } from "@/lib/database";
import { signIn, signOut } from "./actions";
export const metadata: Metadata = {
  title: "Rendszerállapot",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function Admin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const authorized = await isOperator();
  const configured = validSecret(process.env.OPERATIONS_TOKEN);
  const { error } = await searchParams;
  if (!authorized)
    return (
      <Shell active="admin">
        <p className="eyebrow">ÜZEMELTETÉS</p>
        <h1>Rendszerállapot</h1>
        <p className="lead">Védett áttekintés az alkalmazás működéséről.</p>
        <section className="login-panel">
          <span className="lock-symbol" aria-hidden="true">
            ◎
          </span>
          <h2>Üzemeltetői hozzáférés</h2>
          <p>
            A rendszeradatok megtekintéséhez add meg az üzemeltetői hozzáférési
            kulcsot.
          </p>
          {configured ? (
            <form action={signIn}>
              <label htmlFor="token">Hozzáférési kulcs</label>
              <input
                id="token"
                name="token"
                type="password"
                autoComplete="current-password"
                required
                maxLength={1024}
                aria-describedby={error ? "login-error" : undefined}
              />
              {error && (
                <p role="alert" id="login-error" className="error-message">
                  A hozzáférési kulcs nem megfelelő.
                </p>
              )}
              <button className="button" type="submit">
                Biztonságos belépés <span aria-hidden="true">→</span>
              </button>
              <small>A munkamenet egy óra után lejár.</small>
            </form>
          ) : (
            <p className="notice">
              Az üzemeltetői hozzáférés beállítása folyamatban van.
            </p>
          )}
        </section>
      </Shell>
    );
  const database = await databaseHealth();
  return (
    <Shell active="admin">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ÜZEMELTETÉS</p>
          <h1>Rendszerállapot</h1>
        </div>
        <form action={signOut}>
          <button type="submit" className="button button-secondary">
            Kilépés
          </button>
        </form>
      </div>
      <p className="lead">
        Élő ellenőrzés ·{" "}
        {new Intl.DateTimeFormat("hu-HU", {
          dateStyle: "medium",
          timeStyle: "medium",
          timeZone: "Europe/Budapest",
        }).format(new Date())}
      </p>
      <div className="feature-grid metrics">
        <article className="feature-card">
          <p>MongoDB Atlas</p>
          <h2 className={database.connected ? "positive" : "negative"}>
            {database.connected ? "Kapcsolódva" : "Nincs kapcsolat"}
          </h2>
          <small>Az adatbázis válasza alapján</small>
        </article>
        <article className="feature-card">
          <p>Adatbázis válaszideje</p>
          <h2>
            {database.latencyMs === null
              ? "Nem elérhető"
              : `${database.latencyMs} ms`}
          </h2>
          <small>Kapcsolódás és állapotellenőrzés</small>
        </article>
        <article className="feature-card">
          <p>Aktív felhasználók</p>
          <h2>Még nincs mérés</h2>
          <small>A jelenlétkövetés a valós idejű funkciókkal érkezik.</small>
        </article>
      </div>
      <section className="feature-card release-details">
        <h2>Kiadás: 0.4.0</h2>
        <p>
          Az alkalmazás és a védett állapotellenőrzés elérhető. A kereskedelmi
          funkciók fejlesztés alatt állnak.
        </p>
        <a className="button" href="/admin">
          Állapot frissítése ↻
        </a>
      </section>
    </Shell>
  );
}
