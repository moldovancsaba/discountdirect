import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import { activate } from "./actions";

export const metadata: Metadata = {
  title: "Fiók aktiválása",
  robots: { index: false, follow: false },
};
export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token = "", error } = await searchParams;
  const message =
    error === "password"
      ? "A két jelszó egyezzen, és legalább 12 karakter legyen."
      : error === "token"
        ? "A hivatkozás érvénytelen, lejárt vagy már felhasználták."
        : error
          ? "Az aktiválás átmenetileg nem érhető el."
          : null;
  return (
    <Shell>
      <p className="eyebrow">FIÓKAKTIVÁLÁS</p>
      <h1>Állíts be új jelszót</h1>
      <section className="login-panel" aria-labelledby="activation-title">
        <h2 id="activation-title">Egyszer használatos aktiválás</h2>
        <p>
          A hivatkozás felhasználás után érvényét veszti. A jelszó 12–128
          karakter hosszú legyen.
        </p>
        {token ? (
          <form action={activate}>
            <input type="hidden" name="token" value={token} />
            <label htmlFor="password">Új jelszó</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
            />
            <label htmlFor="confirmation">Jelszó újra</label>
            <input
              id="confirmation"
              name="confirmation"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
            />
            {message ? (
              <p role="alert" className="error-message">
                {message}
              </p>
            ) : null}
            <button className="button" type="submit">
              Fiók aktiválása
            </button>
          </form>
        ) : (
          <p role="alert" className="error-message">
            {message ?? "Az aktiváló hivatkozásból hiányzik a token."}
          </p>
        )}
      </section>
    </Shell>
  );
}
