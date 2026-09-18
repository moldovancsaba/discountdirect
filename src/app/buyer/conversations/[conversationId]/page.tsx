import { redirect } from "next/navigation";
import { BannerNotice, Button as GdsButton, EmptyState, GdsGrid, GdsIcon, ListingCard, PageHeader, SectionPanel, Textarea as GdsTextarea } from "@discountdirect/gds-client";
import { currentUser } from "@/auth/service";
import { Shell } from "@/components/shell";
import { RealtimeThread } from "@/components/realtime-thread";
import { conversationTimeline } from "@/messaging/service";
import { respondConversationOfferAction, sendConversationMessageAction } from "@/app/conversations/actions";

export const dynamic = "force-dynamic";
const date = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Budapest" });
const money = new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
const offerStatus: Record<string, string> = { pending: "Függő", accepted: "Elfogadva", declined: "Elutasítva", expired: "Lejárt", cancelled: "Lezárva" };
const eventType: Record<string, string> = { created: "Ajánlat érkezett", accepted: "Ajánlat elfogadva", declined: "Ajánlat elutasítva", expired: "Ajánlat lejárt", cancelled: "Ajánlat lezárva" };
type TimelineEvent = Awaited<ReturnType<typeof conversationTimeline>>["events"][number];

function timelineCard(event: TimelineEvent, returnTo: string) {
  if (event.kind === "offer" && event.offer) {
    return <ListingCard
      key={event.id}
      title={eventType[event.offerEventType] ?? "Ajánlat"}
      description={event.offer.reason.text}
      price={money.format(event.offer.priceHuf)}
      mediaSeed={event.offer.id}
      mediaOverlay={event.offer.status === "pending" ? `${event.offer.discountPct}% kedvezmény` : offerStatus[event.offer.status] ?? event.offer.status}
      metadata={[
        { id: "product", label: "Termék", value: event.offer.product.name },
        { id: "reference", label: "30 napos összehasonlító ár", value: money.format(event.offer.referencePriceHuf) },
        { id: "catalog", label: "Katalógusár az ajánlatkor", value: money.format(event.offer.originalHuf) },
        { id: "expiry", label: "Érvényes", value: date.format(new Date(event.offer.expiresAt)) },
        { id: "when", label: "Időpont", value: date.format(new Date(event.createdAt)) },
      ]}
      primaryAction={event.offer.status === "pending" ? <div className="button-row">
        <form action={respondConversationOfferAction.bind(null, returnTo, event.offer.id, event.offer.version, "accepted")}><GdsButton type="submit" leftSection={<GdsIcon name="Check" decorative />}>{event.offer.campaignId ? "Lefoglalom" : "Elfogadom"}</GdsButton></form>
        <form action={respondConversationOfferAction.bind(null, returnTo, event.offer.id, event.offer.version, "declined")}><GdsButton type="submit" variant="default" leftSection={<GdsIcon name="Close" decorative />}>Elutasítom</GdsButton></form>
      </div> : undefined}
    />;
  }
  return <ListingCard key={event.id} title={event.kind === "activity" ? "Beszélgetés megnyitva" : event.senderRole === "buyer" ? "Te" : "Eladó"} description={event.body ?? "A beszélgetés megnyitásának rendszernaplója."} mediaSeed={event.id} mediaOverlay={event.kind === "activity" ? "Esemény" : "Üzenet"} metadata={[{ id: "when", label: "Időpont", value: date.format(new Date(event.createdAt)) }]} />;
}

export default async function BuyerConversationPage({ params, searchParams }: { params: Promise<{ conversationId: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const { conversationId } = await params;
  let result;
  try { result = await conversationTimeline(user.id, conversationId); if (result.role !== "buyer") redirect("/account?error=forbidden"); } catch { redirect("/account?error=forbidden"); }
  const query = await searchParams;
  const returnTo = `/buyer/conversations/${conversationId}`;
  return <Shell active="buyer">
    <PageHeader title={result.conversation.seller.name} description="A saját, eladóhoz kötött beszélgetési idővonalad." eyebrow="Üzenetváltás" actions={<GdsButton component="a" href="/buyer/conversations" variant="default">Összes üzenet</GdsButton>} />
    {query.saved === "message" ? <BannerNotice severity="success" variant="compact" message="Az üzenet rögzítve." /> : null}
    {query.saved === "offer" ? <BannerNotice severity="success" variant="compact" message="Az ajánlati döntés rögzítve. Elfogadáskor kupon is létrejön." /> : null}
    {query.error ? <BannerNotice severity="error" variant="compact" message="A művelet nem rögzíthető. Az ajánlat állapota vagy verziója közben megváltozhatott." /> : null}
    <RealtimeThread conversationId={conversationId} />
    <SectionPanel title="Idővonal" description="A beszélgetés eseményei létrehozási sorrendben.">
      {!result.events.length ? <EmptyState title="Még nincs esemény" description="Az első üzenet itt fog megjelenni." /> : <GdsGrid columns={{ base: 1 }}>{result.events.map((event) => timelineCard(event, returnTo))}</GdsGrid>}
    </SectionPanel>
    <SectionPanel title="Válasz küldése" description="Az üzenet tartósan, az eladói kapcsolathoz kötve kerül mentésre."><form action={sendConversationMessageAction.bind(null, conversationId, returnTo)}><GdsTextarea name="body" label="Üzenet" minRows={4} required maxLength={2000} /><GdsButton type="submit">Üzenet rögzítése</GdsButton></form></SectionPanel>
  </Shell>;
}
