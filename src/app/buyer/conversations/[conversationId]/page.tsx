import { redirect } from "next/navigation";
import { BannerNotice, Button as GdsButton, EmptyState, GdsGrid, ListingCard, PageHeader, SectionPanel, Textarea as GdsTextarea } from "@discountdirect/gds-client";
import { currentUser } from "@/auth/service";
import { Shell } from "@/components/shell";
import { conversationTimeline } from "@/messaging/service";
import { sendConversationMessageAction } from "@/app/conversations/actions";

export const dynamic = "force-dynamic";
const date = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Budapest" });

export default async function BuyerConversationPage({ params, searchParams }: { params: Promise<{ conversationId: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const { conversationId } = await params;
  let result;
  try { result = await conversationTimeline(user.id, conversationId); if (result.role !== "buyer") redirect("/account?error=forbidden"); } catch { redirect("/account?error=forbidden"); }
  const query = await searchParams;
  const returnTo = `/buyer/conversations/${conversationId}`;
  return <Shell active="account">
    <PageHeader title={result.conversation.seller.name} description="A saját, eladóhoz kötött beszélgetési idővonalad." eyebrow="Üzenetváltás" actions={<GdsButton component="a" href="/buyer/conversations" variant="default">Összes üzenet</GdsButton>} />
    {query.saved === "message" ? <BannerNotice severity="success" variant="compact" message="Az üzenet rögzítve." /> : null}
    {query.error ? <BannerNotice severity="error" variant="compact" message="Az üzenet nem küldhető el." /> : null}
    <SectionPanel title="Idővonal" description="A beszélgetés eseményei létrehozási sorrendben.">
      {!result.events.length ? <EmptyState title="Még nincs esemény" description="Az első üzenet itt fog megjelenni." /> : <GdsGrid columns={{ base: 1 }}>{result.events.map((event) => <ListingCard key={event.id} title={event.kind === "activity" ? "Beszélgetés megnyitva" : event.senderRole === "buyer" ? "Te" : "Eladó"} description={event.body ?? "A beszélgetés megnyitásának rendszernaplója."} mediaSeed={event.id} mediaOverlay={event.kind === "activity" ? "Esemény" : "Üzenet"} metadata={[{ id: "when", label: "Időpont", value: date.format(new Date(event.createdAt)) }]} />)}</GdsGrid>}
    </SectionPanel>
    <SectionPanel title="Válasz küldése" description="Az üzenet tartósan, az eladói kapcsolathoz kötve kerül mentésre."><form action={sendConversationMessageAction.bind(null, conversationId, returnTo)}><GdsTextarea name="body" label="Üzenet" minRows={4} required maxLength={2000} /><GdsButton type="submit">Üzenet rögzítése</GdsButton></form></SectionPanel>
  </Shell>;
}
