import Link from "next/link";
import { Shell } from "@/components/shell";
const steps = [
  {
    number: "01",
    title: "Ismerd meg a vásárlóidat",
    text: "Termékek és vásárlási előzmények egy helyen, a saját ügyfélkapcsolataidhoz kötve.",
  },
  {
    number: "02",
    title: "Ajánlj személyesen",
    text: "Érthető ajánlások, amelyek megmutatják, miért lehet releváns egy termék.",
  },
  {
    number: "03",
    title: "Folytasd a beszélgetést",
    text: "Ajánlatok és válaszok egy közös történetben, követhető döntésekkel.",
  },
];
export default function Home() {
  return (
    <Shell>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ÁTTEKINTÉS</p>
          <h1>
            Minden jó ajánlat
            <br />
            egy kapcsolattal kezdődik.
          </h1>
          <p className="lead">
            A DiscountDirect összeköti a vásárlási előzményeket,
            <br className="desktop-break" /> a személyes ajánlatokat és a
            beszélgetéseket.
          </p>
        </div>
        <span className="pill">0.3.0 · Fejlesztés alatt</span>
      </div>
      <section className="hero-panel" aria-labelledby="foundation-title">
        <div>
          <span className="eyebrow">AZ ELSŐ LÉPÉS</span>
          <h2 id="foundation-title">
            Stabil alapok.
            <br />
            Személyesebb kereskedelem.
          </h2>
          <p>
            Az alkalmazás alapja elkészült. Az üzemeltetői nézetben
            ellenőrizhető az adatbázis-kapcsolat és a rendszer állapota.
          </p>
          <Link className="button button-light" href="/sign-in">
            Bejelentkezés <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="relationship-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <span className="art-node node-one">Vásárló</span>
          <span className="art-center">d.</span>
          <span className="art-node node-two">Ajánlat</span>
          <span className="art-caption">A kapcsolat a középpontban.</span>
        </div>
      </section>
      <section aria-labelledby="next-title">
        <div className="section-heading">
          <h2 id="next-title">A következő fejezetek</h2>
          <span className="muted">Tervezett funkciók</span>
        </div>
        <div className="feature-grid">
          {steps.map((step) => (
            <article className="feature-card" key={step.number}>
              <span className="step-number">{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
              <span className="small-status">Előkészítés alatt</span>
            </article>
          ))}
        </div>
      </section>
      <div className="release-note">
        <span className="info-icon" aria-hidden="true">
          i
        </span>
        <p>
          Ez az alapozó kiadás még nem kezel vásárlói fiókokat, üzeneteket vagy
          ajánlatokat. A bevezetés lépései a{" "}
          <a href="https://github.com/users/moldovancsaba/projects/61">
            projekttervben
          </a>{" "}
          követhetők.
        </p>
      </div>
    </Shell>
  );
}
