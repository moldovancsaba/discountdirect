import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/auth/service";
import { Shell } from "@/components/shell";
import { signIn } from "./actions";

export const metadata: Metadata = {
  title: "Bejelentkezés",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const messages = {
  invalid: "Az e-mail-cím vagy a jelszó nem megfelelő.",
  limited: "Túl sok próbálkozás történt. Próbáld újra 15 perc múlva.",
  unavailable: "A bejelentkezés átmenetileg nem érhető el.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await currentUser()) redirect("/account");
  const { error } = await searchParams;
  const message = error && messages[error as keyof typeof messages];
  return (
    <Shell active="sign-in">
      <p className="eyebrow">BIZTONSÁGOS HOZZÁFÉRÉS</p>
      <h1>Bejelentkezés</h1>
      <p className="lead">A saját eladói vagy vásárlói munkaterületedhez.</p>
      <section className="login-panel" aria-labelledby="login-title">
        <span className="lock-symbol" aria-hidden="true">
          ◎
        </span>
        <h2 id="login-title">Fiók megnyitása</h2>
        <p>
          Nincs nyilvános regisztráció. A fiókokat az üzemeltető biztonságos,
          egyszer használatos hivatkozással aktiválja.
        </p>
        <form action={signIn}>
          <label htmlFor="email">E-mail-cím</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            maxLength={254}
          />
          <label htmlFor="password">Jelszó</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={12}
            maxLength={128}
            aria-describedby={message ? "login-error" : undefined}
          />
          {message ? (
            <p role="alert" id="login-error" className="error-message">
              {message}
            </p>
          ) : null}
          <button className="button" type="submit">
            Bejelentkezés <span aria-hidden="true">→</span>
          </button>
          <small>
            A munkamenet 30 perc tétlenség vagy legfeljebb 12 óra után lejár.
          </small>
        </form>
      </section>
    </Shell>
  );
}
