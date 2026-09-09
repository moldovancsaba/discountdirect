import { redirect } from "next/navigation";
import { Button as GdsButton, EmptyState, GdsGrid, GdsIcon, ListingCard, PageHeader, StatusBadge } from "@discountdirect/gds-client";
import { currentUser } from "@/auth/service";
import { Shell } from "@/components/shell";
import { sellerConversations } from "@/messaging/service";

export const dynamic = "force-dynamic";
const date = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Budapest" });

export default async function SellerConversationsPage({ params }: { params: Promise<{ sellerSlug: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const { sellerSlug } = await params;
  let result;
  try { result = await sellerConversations(user.id, sellerSlug); } catch { redirect("/account?error=forbidden"); }
  return <Shell active="account">
    <PageHeader title="Beszélgetések" description="Tartós, eladóhoz kötött vásárlói beszélgetések. Az új üzenetek itt jelennek meg; élő frissítés a következő kiadásban érkezik." eyebrow={result.seller.name} actions={<StatusBadge status="info">{result.conversations.length} beszélgetés</StatusBadge>} />
    {!result.conversations.length ? <EmptyState title="Még nincs beszélgetés" description="Nyisd meg egy összekapcsolt vásárló előzményeit, és indíts beszélgetést onnan." /> : <GdsGrid columns={{ base: 1, md: 2 }}>
      {result.conversations.map((conversation) => <ListingCard key={conversation.id} title={conversation.customer?.displayName ?? conversation.buyer.displayName} description={conversation.lastEventPreview} mediaSeed={conversation.id} mediaOverlay={conversation.sellerUnreadCount ? `${conversation.sellerUnreadCount} új` : "Olvasott"} metadata={[{ id: "when", label: "Utolsó esemény", value: date.format(new Date(conversation.lastEventAt)) }, { id: "offers", label: "Függő ajánlat", value: String(conversation.pendingOfferCount) }]} primaryAction={<GdsButton component="a" href={`/seller/${sellerSlug}/conversations/${conversation.id}`} leftSection={<GdsIcon name="Message" decorative />}>Megnyitás</GdsButton>} />)}
    </GdsGrid>}
  </Shell>;
}
