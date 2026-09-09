import type { Metadata } from "next";
import Link from "next/link";
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
  sso_denied: "Az SSO-hozzáférést megszakították vagy elutasították.",
  sso_disabled: "Ez a DiscountDirect-fiók le van tiltva.",
  sso_failed: "Az SSO-bejelentkezés nem ellenőrizhető. Próbáld újra.",
  sso_unavailable: "Az SSO-bejelentkezés átmenetileg nem érhető el.",
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
          Használd a központi DoneIsBetter-fiókodat, vagy jelentkezz be a
          korábban aktivált helyi hozzáféréseddel.
        </p>
        {message ? (
          <p role="alert" id="login-error" className="error-message">
            {message}
          </p>
        ) : null}
        <Link className="button sso-button" href="/api/auth/login?returnTo=/account">
          Bejelentkezés DoneIsBetter SSO-val <span aria-hidden="true">→</span>
        </Link>
        <div className="login-divider"><span>vagy</span></div>
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
