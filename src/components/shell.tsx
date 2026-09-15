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
  { href: "/", label: "Kezdőlap", icon: "Home", key: "home" },
  { href: "/account", label: "Saját munkatér", icon: "Profile", key: "account" },
  { href: "/buyer", label: "Vásárlói műveletek", icon: "Tag", key: "buyer" },
  { href: "/admin", label: "Üzemeltetés", icon: "Analytics", key: "admin" },
  { href: "/sign-in", label: "Bejelentkezés", icon: "Login", key: "sign-in" },
] as const;

type NavigationKey = (typeof navigation)[number]["key"];

export function Shell({ children, active = "home" }: { children: React.ReactNode; active?: NavigationKey }) {
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
      <SidebarNavSection label="Rendszer" pushToBottom>
        <SidebarNavItem
          component={Link}
          href="/account"
          label="Profil és jogosultság"
          icon={<GdsIcon name="Settings" decorative />}
          active={active === "account"}
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
            <span className="gds-header-context">Ajánlatok, kapcsolatok, kuponok</span>
            <ThemeToggle />
          </GdsCluster>
        </GdsCluster>
      }
      sidebar={nav}
      footer={<span className="gds-footer-label">DiscountDirect</span>}
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
