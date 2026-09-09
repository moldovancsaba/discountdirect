import { redirect } from "next/navigation";
import { Button as GdsButton, EmptyState, GdsGrid, GdsIcon, ListingCard, PageHeader, StatusBadge } from "@discountdirect/gds-client";
import { currentUser } from "@/auth/service";
import { Shell } from "@/components/shell";
import { buyerConversations } from "@/messaging/service";

export const dynamic = "force-dynamic";
const date = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Budapest" });

export default async function BuyerConversationsPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const result = await buyerConversations(user.id);
  return <Shell active="account">
    <PageHeader title="Üzeneteim" description="Csak azoknak az eladóknak a beszélgetései látszanak itt, amelyekhez aktív vásárlói kapcsolatod van." eyebrow="Vásárlói kapcsolatok" actions={<StatusBadge status="info">{result.conversations.length} beszélgetés</StatusBadge>} />
    {!result.conversations.length ? <EmptyState title="Még nincs beszélgetés" description="Az eladó által indított vagy korábban megnyitott beszélgetések itt jelennek meg." /> : <GdsGrid columns={{ base: 1, md: 2 }}>
      {result.conversations.map((conversation) => <ListingCard key={conversation.id} title={conversation.seller.name} description={conversation.lastEventPreview} mediaSeed={conversation.id} mediaOverlay={conversation.buyerUnreadCount ? `${conversation.buyerUnreadCount} új` : "Olvasott"} metadata={[{ id: "when", label: "Utolsó esemény", value: date.format(new Date(conversation.lastEventAt)) }, { id: "offers", label: "Függő ajánlat", value: String(conversation.pendingOfferCount) }]} primaryAction={<GdsButton component="a" href={`/buyer/conversations/${conversation.id}`} leftSection={<GdsIcon name="Message" decorative />}>Megnyitás</GdsButton>} />)}
    </GdsGrid>}
  </Shell>;
}
