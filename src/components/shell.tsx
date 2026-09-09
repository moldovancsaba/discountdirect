"use client";

import Link from "next/link";
import {
  DiscoveryShell,
  GdsCluster,
  GdsIcon,
  SidebarNav,
  SidebarNavItem,
  SidebarNavSection,
  ThemeToggle,
} from "@sovereignsquad/gds-core/client";

const navigation = [
  { href: "/", label: "Áttekintés", icon: "Home", key: "home" },
  { href: "/admin", label: "Rendszerállapot", icon: "Analytics", key: "admin" },
  { href: "/account", label: "Saját munkatér", icon: "Profile", key: "account" },
  { href: "/sign-in", label: "Bejelentkezés", icon: "Login", key: "sign-in" },
] as const;

export function Shell({ children, active = "home" }: { children: React.ReactNode; active?: "home" | "admin" | "account" | "sign-in" }) {
  const nav = (
    <SidebarNav ariaLabel="Fő navigáció">
      <SidebarNavSection label="Munkaterület">
        {navigation.map((item) => (
          <SidebarNavItem
            key={item.key}
            component={Link}
            href={item.href}
            label={item.label}
            icon={<GdsIcon name={item.icon} decorative />}
            active={active === item.key}
          />
        ))}
      </SidebarNavSection>
      <SidebarNavSection label="Kiadás" pushToBottom>
        <SidebarNavItem
          component="a"
          href="https://github.com/moldovancsaba/discountdirect/issues"
          label="Fejlesztési terv"
          description="0.9.0 · GDS"
          icon={<GdsIcon name="Launch" decorative />}
        />
      </SidebarNavSection>
    </SidebarNav>
  );

  return (
    <DiscoveryShell
      header={
        <GdsCluster>
          <Link className="gds-brand" href="/" aria-label="DiscountDirect kezdőlap">
            <span className="gds-brand-mark" aria-hidden="true">d.</span>
            <span>discountdirect</span>
          </Link>
          <GdsCluster>
            <span className="gds-header-context">Kapcsolatokból lehetőség</span>
            <ThemeToggle />
          </GdsCluster>
        </GdsCluster>
      }
      sidebar={nav}
      footer={<span className="gds-release">Mint circuit · 0.9.0</span>}
      mobileNavigationLabel="Navigáció megnyitása"
      desktopNavigationLabel="Oldalsáv váltása"
      sidebarStorageKey="discountdirect-sidebar"
      desktopCollapsible
      shellPadding="lg"
    >
      <main id="main" className="gds-page">{children}</main>
    </DiscoveryShell>
  );
}
