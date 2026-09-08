"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="error-page">
      <h1>Valami nem sikerült.</h1>
      <p>Próbáld újra néhány pillanat múlva.</p>
      <button className="button" onClick={reset}>
        Újrapróbálás
      </button>
      <Link href="/">Vissza az áttekintéshez</Link>
    </main>
  );
}
