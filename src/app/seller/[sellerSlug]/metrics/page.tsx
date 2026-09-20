import { redirect } from "next/navigation";
import { BannerNotice, GdsGrid, GdsIcon, MetricCard, PageHeader, SectionPanel, SimpleDataTable } from "@discountdirect/gds-client";
import { currentUser } from "@/auth/service";
import { Shell } from "@/components/shell";
import { sellerMetrics } from "@/reporting/service";

export const dynamic = "force-dynamic";
const number = new Intl.NumberFormat("hu-HU");
const money = new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Budapest" });

export default async function MetricsPage({ params }: { params: Promise<{ sellerSlug: string }> }) {
  const user = await currentUser(); if (!user) redirect("/sign-in"); const { sellerSlug } = await params;
  let data; try { data = await sellerMetrics(user.id, sellerSlug); } catch { redirect("/account?error=forbidden"); }
  return <Shell><PageHeader eyebrow="Eladói munkatér" title="Eredmények" description="A lezárt riportgeneráció összesített üzleti mutatói. A tranzakciós adatok változatlanul az elsődleges források." />
    {!data.ready ? <BannerNotice severity="warning" message="A riport még nem készült el. Az üzleti adatok helyett nem jelenítünk meg félkész vagy nulla értékeket." /> : <>
      {data.stale ? <BannerNotice severity="warning" message={`A riport frissítése késik. Utolsó sikeres számítás: ${date.format(new Date(data.computedAt))}.`} /> : <BannerNotice severity="success" variant="compact" message={`Utolsó sikeres számítás: ${date.format(new Date(data.computedAt))}.`} />}
      <GdsGrid columns={{ base: 1, md: 3 }}>
        <MetricCard label="Kampányok" value={number.format(data.totals.campaigns)} description={`${number.format(data.totals.offers)} ajánlat`} icon={<GdsIcon name="Send" decorative />} />
        <MetricCard label="Elfogadott ajánlatok" value={number.format(data.totals.acceptedOffers)} description={`${number.format(data.totals.declinedOffers)} elutasított`} icon={<GdsIcon name="Check" decorative />} />
        <MetricCard label="Sikeres kézbesítések" value={number.format(data.totals.sentDeliveries)} description={`${number.format(data.totals.failedDeliveries)} hibás · ${number.format(data.totals.suppressedDeliveries)} letiltott`} icon={<GdsIcon name="Connectivity" decorative />} />
        <MetricCard label="Vásárlások" value={number.format(data.totals.purchases)} description={`${number.format(data.totals.refunds)} visszatérítés`} icon={<GdsIcon name="Package" decorative />} />
        <MetricCard label="Bevétel" value={money.format(data.totals.revenueHuf)} description="Aktív vásárlási tételekből" icon={<GdsIcon name="Analytics" decorative />} />
        <MetricCard label="Automatikus futások" value={number.format(data.totals.automationRuns)} description={`${number.format(data.totals.failedAutomationRuns)} sikertelen`} icon={<GdsIcon name="Calendar" decorative />} />
      </GdsGrid>
      <SectionPanel title="Napi bontás" description="Az utolsó 90 nap lezárt, újraépíthető összesítése."><div className="table-wrap"><SimpleDataTable rows={data.days.map((row) => ({ day: date.format(new Date(row.day)), campaigns: number.format(row.counters.campaigns), offers: number.format(row.counters.offers), sent: number.format(row.counters.sentDeliveries), purchases: number.format(row.counters.purchases), revenue: money.format(row.counters.revenueHuf) }))} columns={[{ key: "day", header: "Nap" }, { key: "campaigns", header: "Kampány" }, { key: "offers", header: "Ajánlat" }, { key: "sent", header: "Kézbesítve" }, { key: "purchases", header: "Vásárlás" }, { key: "revenue", header: "Bevétel" }]} /></div></SectionPanel>
    </>}
  </Shell>;
}
