import { redirect } from "next/navigation";
import { BannerNotice, Button as GdsButton, EmptyState, GdsGrid, ListingCard, PageHeader, SectionPanel, Textarea as GdsTextarea } from "@discountdirect/gds-client";
import { currentUser } from "@/auth/service";
import { Shell } from "@/components/shell";
import { RealtimeThread } from "@/components/realtime-thread";
import { conversationTimeline } from "@/messaging/service";
import { sendConversationMessageAction } from "@/app/conversations/actions";

export const dynamic = "force-dynamic";
const date = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Budapest" });
const errors: Record<string, string> = { INVALID: "Az üzenet nem lehet üres vagy 2000 karakternél hosszabb.", FORBIDDEN: "A beszélgetés nem érhető el." };

export default async function SellerConversationPage({ params, searchParams }: { params: Promise<{ sellerSlug: string; conversationId: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const { sellerSlug, conversationId } = await params;
  let result;
  try { result = await conversationTimeline(user.id, conversationId); if (result.conversation.seller.slug !== sellerSlug || result.role !== "seller") redirect("/account?error=forbidden"); } catch { redirect("/account?error=forbidden"); }
  const query = await searchParams;
  const returnTo = `/seller/${sellerSlug}/conversations/${conversationId}`;
  return <Shell active="account">
    <PageHeader title={result.conversation.customer?.displayName ?? result.conversation.buyer.displayName} description="Eladóhoz kötött beszélgetési idővonal. Az üzenet mentés után azonnal megjelenik; valós idejű kézbesítés még nincs." eyebrow="Beszélgetés" actions={<GdsButton component="a" href={`/seller/${sellerSlug}/conversations`} variant="default">Összes beszélgetés</GdsButton>} />
    {query.saved === "message" ? <BannerNotice severity="success" variant="compact" message="Az üzenet rögzítve." /> : null}
    {query.error ? <BannerNotice severity="error" variant="compact" message={errors[query.error] ?? "Az üzenet nem küldhető el."} /> : null}
    <RealtimeThread conversationId={conversationId} />
    <SectionPanel title="Idővonal" description="Az események létrehozási idő és azonosító szerint rendezettek." divided={false}>
      {!result.events.length ? <EmptyState title="Még nincs esemény" description="Az első üzenet itt fog megjelenni." /> : <GdsGrid columns={{ base: 1 }}>
        {result.events.map((event) => <ListingCard key={event.id} title={event.kind === "activity" ? "Beszélgetés megnyitva" : event.senderRole === "seller" ? "Eladó" : "Vásárló"} description={event.body ?? "A beszélgetés megnyitásának rendszernaplója."} mediaSeed={event.id} mediaOverlay={event.kind === "activity" ? "Esemény" : "Üzenet"} metadata={[{ id: "when", label: "Időpont", value: date.format(new Date(event.createdAt)) }]} />)}
      </GdsGrid>}
    </SectionPanel>
    <SectionPanel title="Új üzenet" description="A mentési ismétlés ugyanahhoz a klienskéréshez csak egy üzenetet rögzít.">
      <form action={sendConversationMessageAction.bind(null, conversationId, returnTo)}><GdsTextarea name="body" label="Üzenet" minRows={4} required maxLength={2000} /><GdsButton type="submit">Üzenet rögzítése</GdsButton></form>
    </SectionPanel>
  </Shell>;
}
