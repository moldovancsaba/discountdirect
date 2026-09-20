"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DiscoveryShell, GdsCluster, GdsIcon, SidebarNav, SidebarNavItem, SidebarNavSection, ThemeToggle } from "@sovereignsquad/gds-core/client";

type IconName = React.ComponentProps<typeof GdsIcon>["name"];
type NavItem = { href: string; label: string; icon: IconName; exact?: boolean };

function itemActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavigationItems({ pathname, items }: { pathname: string; items: NavItem[] }) {
  return items.map((item) => <SidebarNavItem key={item.href} component={Link} href={item.href} label={item.label} icon={<GdsIcon name={item.icon} decorative />} active={itemActive(pathname, item)} />);
}

export function Shell({ children }: { children: React.ReactNode; active?: string }) {
  const pathname = usePathname();
  const sellerSlug = pathname.match(/^\/seller\/([^/]+)/)?.[1];
  const buyerCandidate = pathname.match(/^\/buyer\/([^/]+)/)?.[1];
  const buyerGlobalRoutes = new Set(["conversations", "offers", "lists", "redemptions", "letters"]);
  const buyerSlug = buyerCandidate && !buyerGlobalRoutes.has(buyerCandidate) ? buyerCandidate : undefined;
  const sellerItems: NavItem[] = sellerSlug ? [
    { href: `/seller/${sellerSlug}`, label: "Áttekintés és katalógus", icon: "Package", exact: true },
    { href: `/seller/${sellerSlug}/customers`, label: "Vásárlók", icon: "Users" },
    { href: `/seller/${sellerSlug}/conversations`, label: "Beszélgetések", icon: "Message" },
    { href: `/seller/${sellerSlug}/campaigns`, label: "Villámkampányok", icon: "Send" },
    { href: `/seller/${sellerSlug}/metrics`, label: "Eredmények", icon: "Analytics" },
    { href: `/seller/${sellerSlug}/automations`, label: "Automatizmusok", icon: "Calendar" },
    { href: `/seller/${sellerSlug}/deliveries`, label: "Kézbesítések", icon: "Connectivity" },
    { href: `/seller/${sellerSlug}/redemptions`, label: "Kuponbeváltás", icon: "Tag" },
  ] : [];
  const buyerItems: NavItem[] = [
    { href: "/buyer", label: "Vásárlói áttekintés", icon: "Home", exact: true },
    { href: "/buyer/conversations", label: "Beszélgetések", icon: "Message" },
    { href: "/buyer/offers", label: "Ajánlatok", icon: "Tag" },
    { href: "/buyer/lists", label: "Ajánlatlisták", icon: "List" },
    { href: "/buyer/redemptions", label: "Kuponok", icon: "Check" },
    ...(buyerSlug ? [
      { href: `/buyer/${buyerSlug}`, label: "Vásárlási előzmények", icon: "History", exact: true },
      { href: `/buyer/${buyerSlug}/preferences`, label: "Adatkezelési beállítások", icon: "Settings" },
    ] satisfies NavItem[] : []),
  ];
  const isSeller = Boolean(sellerSlug);
  const isBuyer = pathname === "/buyer" || pathname.startsWith("/buyer/");
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAuthenticatedArea = isSeller || isBuyer || isAdmin || pathname === "/account";

  const nav = <SidebarNav ariaLabel="Fő navigáció">
    {isSeller ? <SidebarNavSection label="Eladói munkatér"><NavigationItems pathname={pathname} items={sellerItems} /></SidebarNavSection> : null}
    {isBuyer ? <SidebarNavSection label="Vásárlói munkatér"><NavigationItems pathname={pathname} items={buyerItems} /></SidebarNavSection> : null}
    {isAdmin ? <SidebarNavSection label="Üzemeltetés"><NavigationItems pathname={pathname} items={[{ href: "/admin", label: "Rendszeráttekintés", icon: "Analytics", exact: true }]} /></SidebarNavSection> : null}
    {!isSeller && !isBuyer && !isAdmin ? <SidebarNavSection label="DiscountDirect"><NavigationItems pathname={pathname} items={[{ href: "/", label: "Kezdőlap", icon: "Home", exact: true }, ...(pathname === "/sign-in" ? [{ href: "/sign-in", label: "Bejelentkezés", icon: "Login", exact: true } satisfies NavItem] : [])]} /></SidebarNavSection> : null}
    {isSeller ? <SidebarNavSection label="Szabályok"><NavigationItems pathname={pathname} items={[{ href: `/seller/${sellerSlug}/privacy`, label: "Adatkezelési kérelmek", icon: "Lock" }, { href: `/seller/${sellerSlug}/settings`, label: "Eladói beállítások", icon: "Settings" }]} /></SidebarNavSection> : null}
    {isAuthenticatedArea ? <SidebarNavSection label="Fiók" pushToBottom><NavigationItems pathname={pathname} items={[{ href: "/account", label: "Munkatérváltás és profil", icon: "Profile", exact: true }]} /></SidebarNavSection> : null}
  </SidebarNav>;

  const context = isSeller ? "Eladói munkatér" : isBuyer ? "Vásárlói munkatér" : isAdmin ? "Üzemeltetés" : "Személyre szabott ajánlatok";
  return <DiscoveryShell
    header={<GdsCluster><Link className="gds-brand" href={isAuthenticatedArea ? "/account" : "/"} aria-label="DiscountDirect"><span className="gds-brand-mark" aria-hidden="true">d.</span><span>discountdirect</span></Link><GdsCluster><span className="gds-header-context">{context}</span><ThemeToggle /></GdsCluster></GdsCluster>}
    sidebar={nav}
    footer={<span className="gds-footer-label">DiscountDirect</span>}
    mobileNavigationLabel="Navigáció megnyitása"
    desktopNavigationLabel="Oldalsáv váltása"
    sidebarStorageKey="discountdirect-sidebar"
    desktopCollapsible
    shellPadding="lg"
  ><main id="main" className="gds-page">{children}</main></DiscoveryShell>;
}
