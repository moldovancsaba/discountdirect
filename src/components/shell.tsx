import Link from "next/link";
export function Shell({
  children,
  active = "home",
}: {
  children: React.ReactNode;
  active?: "home" | "admin";
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="DiscountDirect kezdőlap">
          <span className="brand-mark">d.</span>
          <span>
            discount<span className="brand-light">direct</span>
          </span>
        </Link>
        <div className="workspace">
          <span className="workspace-icon">D</span>
          <div>
            DiscountDirect<small>Kapcsolatokból lehetőség</small>
          </div>
        </div>
        <nav aria-label="Fő navigáció">
          <span className="nav-label">MUNKATERÜLET</span>
          <Link href="/" aria-current={active === "home" ? "page" : undefined}>
            <span aria-hidden="true">◫</span> Áttekintés
          </Link>
          <Link
            href="/admin"
            aria-current={active === "admin" ? "page" : undefined}
          >
            <span aria-hidden="true">◎</span> Rendszerállapot
          </Link>
        </nav>
        <div className="sidebar-footer">
          <span className="release-dot" /> Alapozó kiadás <span>0.2.0</span>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <span>Az ügyfélkapcsolatok új fejezete</span>
          <a href="https://github.com/moldovancsaba/discountdirect/issues">
            Fejlesztési terv ↗
          </a>
        </header>
        <main id="main" className="main-content">
          {children}
        </main>
        <footer className="footer">
          DiscountDirect <span>Kevesebb zaj. Több releváns ajánlat.</span>
        </footer>
      </div>
    </div>
  );
}
