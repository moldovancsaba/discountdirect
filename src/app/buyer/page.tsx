import { redirect } from "next/navigation";
import { Button as GdsButton, EmptyState, GdsGrid, GdsIcon, ListingCard, PageHeader, SectionPanel } from "@discountdirect/gds-client";
import { currentUser } from "@/auth/service";
import { Shell } from "@/components/shell";
import { buyerDeliveries } from "@/delivery/service";
import { buyerConversations } from "@/messaging/service";
import { buyerOffers } from "@/offers/service";
import { buyerOfferLists } from "@/automations/service";
import { buyerCoupons } from "@/redemptions/service";

export const dynamic = "force-dynamic";
const date = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Budapest" });
const money = new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
const channelLabel: Record<string, string> = { in_app: "Alkalmazáson belül", email: "E-mail", postal: "Postai" };

export default async function BuyerHubPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const [conversations, offers, lists, coupons, deliveries] = await Promise.all([buyerConversations(user.id), buyerOffers(user.id), buyerOfferLists(user.id), buyerCoupons(user.id), buyerDeliveries(user.id)]);
  const pendingOffers = offers.offers.filter((offer) => offer.status === "pending");
  const activeLists = lists.lists.filter((list) => list.status === "active");
  const issuedCoupons = coupons.coupons.filter((coupon) => coupon.status === "issued");

  return <Shell active="account">
    <PageHeader title="Vásárlói csatornaközpont" description="Egy helyen láthatók az alkalmazáson belüli ajánlatok, üzenetek, ajánlatlisták, kuponok és kézbesítési állapotok." eyebrow="Vásárlói felület" actions={<div className="button-row"><GdsButton component="a" href="/buyer/conversations" variant="default" leftSection={<GdsIcon name="Message" decorative />}>Üzenetek</GdsButton><GdsButton component="a" href="/buyer/offers" variant="default" leftSection={<GdsIcon name="Tag" decorative />}>Ajánlatok</GdsButton><GdsButton component="a" href="/buyer/lists" variant="default" leftSection={<GdsIcon name="List" decorative />}>Listák</GdsButton></div>} />
    <GdsGrid columns={{ base: 1, md: 3 }}>
      <ListingCard title="Függő ajánlatok" description="Elfogadható vagy elutasítható személyes és kampányajánlatok." mediaSeed="buyer-pending-offers" mediaOverlay="Ajánlat" metadata={[{ id: "count", label: "Darab", value: pendingOffers.length }]} primaryAction={<GdsButton component="a" href="/buyer/offers" leftSection={<GdsIcon name="Tag" decorative />}>Megnyitás</GdsButton>} />
      <ListingCard title="Aktív ajánlatlisták" description="Automatizmusból létrejött, időhöz kötött terméklisták." mediaSeed="buyer-active-lists" mediaOverlay="Lista" metadata={[{ id: "count", label: "Darab", value: activeLists.length }]} primaryAction={<GdsButton component="a" href="/buyer/lists" leftSection={<GdsIcon name="List" decorative />}>Megnyitás</GdsButton>} />
      <ListingCard title="Beváltható kuponok" description="Elfogadott ajánlatokhoz kiadott egyszer használatos kódok." mediaSeed="buyer-coupons" mediaOverlay="Kupon" metadata={[{ id: "count", label: "Darab", value: issuedCoupons.length }]} primaryAction={<GdsButton component="a" href="/buyer/redemptions" leftSection={<GdsIcon name="Tag" decorative />}>Megnyitás</GdsButton>} />
    </GdsGrid>
    <SectionPanel title="Legutóbbi csatornaállapotok" description="Az alkalmazáson belüli rekord külön látszik az e-mail vagy postai kimenő csatornától.">
      {!deliveries.deliveries.length ? <EmptyState title="Még nincs kézbesítési rekord" description="Ajánlat vagy lista létrejöttekor jelenik meg." /> : <GdsGrid columns={{ base: 1, md: 2 }}>
        {deliveries.deliveries.slice(0, 6).map((item) => <ListingCard key={item.id} title={channelLabel[item.channel] ?? item.channel} description={item.reasonCode} mediaSeed={item.id} mediaOverlay={item.status} metadata={[{ id: "kind", label: "Típus", value: item.kind }, { id: "created", label: "Létrejött", value: date.format(new Date(item.createdAt)) }]} />)}
      </GdsGrid>}
    </SectionPanel>
    <SectionPanel title="Friss ajánlatok és beszélgetések" description="A fontos műveletek elérhetők a részletes oldalakon.">
      <GdsGrid columns={{ base: 1, md: 2 }}>
        {pendingOffers.slice(0, 4).map((offer) => <ListingCard key={offer.id} title={offer.product.name} description={offer.reason.text} price={money.format(offer.priceHuf)} mediaSeed={offer.id} mediaOverlay={`${offer.discountPct}%`} metadata={[{ id: "expiry", label: "Érvényes", value: date.format(new Date(offer.expiresAt)) }]} primaryAction={<GdsButton component="a" href="/buyer/offers" variant="default">Döntés megnyitása</GdsButton>} />)}
        {conversations.conversations.slice(0, 4).map((conversation) => <ListingCard key={conversation.id} title={conversation.seller.name} description={conversation.lastEventPreview} mediaSeed={conversation.id} mediaOverlay={conversation.buyerUnreadCount ? `${conversation.buyerUnreadCount} új` : "Olvasott"} metadata={[{ id: "when", label: "Utolsó esemény", value: date.format(new Date(conversation.lastEventAt)) }]} primaryAction={<GdsButton component="a" href={`/buyer/conversations/${conversation.id}`} variant="default">Beszélgetés</GdsButton>} />)}
      </GdsGrid>
    </SectionPanel>
  </Shell>;
}
