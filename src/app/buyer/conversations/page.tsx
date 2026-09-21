import { redirect } from "next/navigation";
import { BannerNotice, Button as GdsButton, EmptyState, GdsGrid, GdsIcon, ListingCard, PageHeader, Select as GdsSelect, StatusBadge } from "@discountdirect/gds-client";
import { currentUser } from "@/auth/service";
import { Shell } from "@/components/shell";
import { buyerInbox } from "@/messaging/service";
import { saveInboxModeAction } from "./actions";

export const dynamic = "force-dynamic";
const date = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Budapest" });

export default async function BuyerConversationsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const result = await buyerInbox(user.id); const query = await searchParams;
  return <Shell active="buyer">
    <PageHeader title="Üzeneteim" description="Csak azoknak az eladóknak a beszélgetései látszanak itt, amelyekhez aktív vásárlói kapcsolatod van." eyebrow="Vásárlói kapcsolatok" actions={<StatusBadge status="info">{result.conversations.length} beszélgetés</StatusBadge>} />
    {query.saved ? <BannerNotice severity="success" variant="compact" message="A postaláda nézete frissült." /> : null}{query.error ? <BannerNotice severity="error" variant="compact" message="A nézet nem menthető. Az eladói kapcsolat időközben megváltozhatott." /> : null}{result.preferenceRecovered ? <BannerNotice severity="warning" message="A korábban kiválasztott eladói kapcsolat már nem aktív, ezért a postaláda az összes elérhető eladót mutatja." /> : null}
    <form className="catalog-form" action={saveInboxModeAction.bind(null, result.preference.version)}>
      <GdsSelect name="mode" label="Postaláda nézete" defaultValue={result.preference.mode} data={[{ value: "aggregate", label: "Minden eladó együtt" }, { value: "per_seller", label: "Egy eladó külön" }]} />
      <GdsSelect name="sellerId" label="Kiválasztott eladó" defaultValue={result.preference.sellerId ?? undefined} data={result.sellers.map((seller) => ({ value: seller.id, label: seller.name }))} disabled={!result.sellers.length} clearable />
      <GdsButton type="submit" leftSection={<GdsIcon name="Save" decorative />}>Nézet mentése</GdsButton>
    </form>
    {!result.conversations.length ? <EmptyState title="Még nincs beszélgetés" description="Az eladó által indított vagy korábban megnyitott beszélgetések itt jelennek meg." /> : <GdsGrid columns={{ base: 1, md: 2 }}>
      {result.conversations.map((conversation) => <ListingCard key={conversation.id} title={conversation.seller.name} description={conversation.lastEventPreview} mediaSeed={conversation.id} mediaOverlay={conversation.buyerUnreadCount ? `${conversation.buyerUnreadCount} új` : "Olvasott"} metadata={[{ id: "when", label: "Utolsó esemény", value: date.format(new Date(conversation.lastEventAt)) }, { id: "offers", label: "Függő ajánlat", value: String(conversation.pendingOfferCount) }]} primaryAction={<GdsButton component="a" href={`/buyer/conversations/${conversation.id}`} leftSection={<GdsIcon name="Message" decorative />}>Megnyitás</GdsButton>} />)}
    </GdsGrid>}
  </Shell>;
}
