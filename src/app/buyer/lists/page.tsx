import { redirect } from "next/navigation";
import { Button as GdsButton, EmptyState, GdsGrid, GdsIcon, ListingCard, PageHeader, SectionPanel, StatusBadge } from "@discountdirect/gds-client";
import { currentUser } from "@/auth/service";
import { buyerOfferLists } from "@/automations/service";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";
const money = new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Budapest" });

export default async function BuyerListsPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const { lists } = await buyerOfferLists(user.id);
  return <Shell active="account">
    <PageHeader title="Ajánlatlistáim" description="Személyre szabott, időzített listák. Ezek nem kézbesítési vagy vásárlási igazolások." eyebrow="Vásárlói felület" actions={<div className="button-row"><GdsButton component="a" href="/buyer/offers" variant="default" leftSection={<GdsIcon name="Tag" decorative />}>Ajánlatok</GdsButton><GdsButton component="a" href="/buyer/redemptions" variant="default" leftSection={<GdsIcon name="Tag" decorative />}>Kuponok</GdsButton><StatusBadge status="info">{lists.length} lista</StatusBadge></div>} />
    <SectionPanel title="Elérhető listák" description="A lista termékei az elkészítéskori ajánlási bizonyítékokat és árakat őrzik.">
      {!lists.length ? <EmptyState title="Még nincs ajánlatlista" description="Az eladó által indított automatizmusok eredményei itt jelennek meg." /> : <GdsGrid columns={{ base: 1, md: 2 }}>
        {lists.map((list) => <ListingCard key={list.id} title={list.title} description={`${list.products.length} termék · elérhető: ${date.format(new Date(list.availableUntil))}`} price={list.products.length ? money.format(list.products[0].priceHuf) : undefined} mediaSeed={list.id} mediaOverlay={list.status} metadata={[{ id: "channel", label: "Csatorna", value: list.channel === "email" ? "E-mail" : "Postai" }, { id: "created", label: "Létrejött", value: date.format(new Date(list.createdAt)) }]} primaryAction={<div className="button-row"><GdsButton component="a" href={`/buyer/lists/${list.id}`} leftSection={<GdsIcon name="Preview" decorative />}>Megnyitás</GdsButton><GdsButton component="a" href={`/buyer/letters/${list.id}`} variant="default" leftSection={<GdsIcon name="Print" decorative />}>Levél</GdsButton></div>} />)}
      </GdsGrid>}
    </SectionPanel>
  </Shell>;
}
