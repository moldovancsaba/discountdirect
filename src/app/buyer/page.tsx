import { redirect } from "next/navigation";
import { BannerNotice, Button as GdsButton, EmptyState, GdsGrid, GdsIcon, ListingCard, PageHeader, SectionPanel } from "@discountdirect/gds-client";
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
const deliveryStatusLabel: Record<string, string> = { queued: "Küldésre vár", processing: "Küldés folyamatban", sent: "Elküldve", unsupported: "Nem elérhető", suppressed: "Nem küldhető", retryable_failed: "Újrapróbálásra vár", cancelled: "Törölve", bounced: "Visszapattant", complained: "Panasz miatt leállítva" };
const deliveryKindLabel: Record<string, string> = { personal_offer: "Személyes ajánlat", flash_campaign: "Villámkampány", automated_list: "Ajánlatlista", printable_letter: "Nyomtatható levél", journey_step: "Ügyfélút üzenet" };

export default async function BuyerHubPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const names = ["conversations", "offers", "lists", "coupons", "deliveries"] as const;
  const results = await Promise.allSettled([buyerConversations(user.id), buyerOffers(user.id), buyerOfferLists(user.id), buyerCoupons(user.id), buyerDeliveries(user.id)]);
  const unavailable = results.flatMap((result, index) => {
    if (result.status === "fulfilled") return [];
    console.error("[buyer-hub] data source failed", {
      source: names[index],
      error: result.reason instanceof Error ? result.reason.message : "UNKNOWN",
    });
    return [names[index]];
  });
  const conversations = results[0].status === "fulfilled" ? results[0].value : { conversations: [], nextCursor: null };
  const offers = results[1].status === "fulfilled" ? results[1].value : { offers: [] };
  const lists = results[2].status === "fulfilled" ? results[2].value : { lists: [] };
  const coupons = results[3].status === "fulfilled" ? results[3].value : { coupons: [] };
  const deliveries = results[4].status === "fulfilled" ? results[4].value : { deliveries: [] };
  const pendingOffers = offers.offers.filter((offer) => offer.status === "pending");
  const activeLists = lists.lists.filter((list) => list.status === "active");
  const issuedCoupons = coupons.coupons.filter((coupon) => coupon.status === "issued");

  return <Shell active="buyer">
    <PageHeader title="Vásárlói csatornaközpont" description="Egy helyen láthatók az alkalmazáson belüli ajánlatok, üzenetek, ajánlatlisták, kuponok és kézbesítési állapotok." eyebrow="Vásárlói felület" actions={<div className="button-row"><GdsButton component="a" href="/buyer/conversations" variant="default" leftSection={<GdsIcon name="Message" decorative />}>Üzenetek</GdsButton><GdsButton component="a" href="/buyer/offers" variant="default" leftSection={<GdsIcon name="Tag" decorative />}>Ajánlatok</GdsButton><GdsButton component="a" href="/buyer/lists" variant="default" leftSection={<GdsIcon name="List" decorative />}>Listák</GdsButton><GdsButton component="a" href="/buyer/watches" variant="default" leftSection={<GdsIcon name="Tag" decorative />}>Termékfigyelések</GdsButton></div>} />
    {unavailable.length ? <BannerNotice severity="warning" title="Néhány adat átmenetileg nem érhető el" message="A többi vásárlói funkció továbbra is használható. Frissítsd az oldalt néhány pillanat múlva." /> : null}
    <GdsGrid columns={{ base: 1, md: 2 }}>
      <ListingCard title="Beszélgetések" description="Eladókkal folytatott üzenetek és ajánlati események." mediaSeed="buyer-conversations" mediaOverlay="Üzenet" metadata={[{ id: "count", label: "Darab", value: conversations.conversations.length }]} primaryAction={<GdsButton component="a" href="/buyer/conversations" leftSection={<GdsIcon name="Message" decorative />}>Megnyitás</GdsButton>} />
      <ListingCard title="Függő ajánlatok" description="Elfogadható vagy elutasítható személyes és kampányajánlatok." mediaSeed="buyer-pending-offers" mediaOverlay="Ajánlat" metadata={[{ id: "count", label: "Darab", value: pendingOffers.length }]} primaryAction={<GdsButton component="a" href="/buyer/offers" leftSection={<GdsIcon name="Tag" decorative />}>Megnyitás</GdsButton>} />
      <ListingCard title="Aktív ajánlatlisták" description="Automatizmusból létrejött, időhöz kötött terméklisták." mediaSeed="buyer-active-lists" mediaOverlay="Lista" metadata={[{ id: "count", label: "Darab", value: activeLists.length }]} primaryAction={<GdsButton component="a" href="/buyer/lists" leftSection={<GdsIcon name="List" decorative />}>Megnyitás</GdsButton>} />
      <ListingCard title="Beváltható kuponok" description="Elfogadott ajánlatokhoz kiadott egyszer használatos kódok." mediaSeed="buyer-coupons" mediaOverlay="Kupon" metadata={[{ id: "count", label: "Darab", value: issuedCoupons.length }]} primaryAction={<GdsButton component="a" href="/buyer/redemptions" leftSection={<GdsIcon name="Tag" decorative />}>Megnyitás</GdsButton>} />
    </GdsGrid>
    <SectionPanel title="Legutóbbi csatornaállapotok" description="Az alkalmazáson belüli rekord külön látszik az e-mail vagy postai kimenő csatornától.">
      {!deliveries.deliveries.length ? <EmptyState title="Még nincs kézbesítési rekord" description="Ajánlat vagy lista létrejöttekor jelenik meg." /> : <GdsGrid columns={{ base: 1, md: 2 }}>
        {deliveries.deliveries.slice(0, 6).map((item) => <ListingCard key={item.id} title={channelLabel[item.channel] ?? item.channel} description={deliveryKindLabel[item.kind] ?? "Értesítés"} mediaSeed={item.id} mediaOverlay={deliveryStatusLabel[item.status] ?? "Feldolgozás alatt"} metadata={[{ id: "kind", label: "Típus", value: deliveryKindLabel[item.kind] ?? item.kind }, { id: "created", label: "Létrejött", value: date.format(new Date(item.createdAt)) }]} />)}
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
