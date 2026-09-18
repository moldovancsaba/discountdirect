import { redirect } from "next/navigation";
import { BannerNotice, Button as GdsButton, EmptyState, GdsGrid, GdsIcon, ListingCard, PageHeader, SectionPanel, Select as GdsSelect, StatusBadge, Textarea as GdsTextarea, TextInput } from "@discountdirect/gds-client";
import { currentUser } from "@/auth/service";
import { Shell } from "@/components/shell";
import { RealtimeThread } from "@/components/realtime-thread";
import { conversationTimeline } from "@/messaging/service";
import { customerHistory } from "@/purchases/service";
import { recommendationPreview } from "@/recommendations/service";
import { conversationRecommendationPreviewAction, createConversationOfferAction, sendConversationMessageAction } from "@/app/conversations/actions";
import { getSellerSettings } from "@/settings/service";
import { DiscountInput } from "@/components/discount-input";

export const dynamic = "force-dynamic";
const date = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Budapest" });
const money = new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
const errors: Record<string, string> = { INVALID: "Az üzenet nem lehet üres vagy 2000 karakternél hosszabb.", FORBIDDEN: "A beszélgetés nem érhető el." };
const offerStatus: Record<string, string> = { pending: "Függő", accepted: "Elfogadva", declined: "Elutasítva", expired: "Lejárt", cancelled: "Lezárva" };
const eventType: Record<string, string> = { created: "Ajánlat elküldve", accepted: "Ajánlat elfogadva", declined: "Ajánlat elutasítva", expired: "Ajánlat lejárt", cancelled: "Ajánlat lezárva" };
const purchaseStatus: Record<string, string> = { purchased: "Vásárlás", refunded: "Visszatérítve", corrected: "Helyesbítve" };
const privacyStatus: Record<string, string> = { active: "Aktív", restricted: "Korlátozott", erasure_requested: "Törlésre jelölve", erased: "Anonimizált" };
type TimelineEvent = Awaited<ReturnType<typeof conversationTimeline>>["events"][number];

function timelineCard(event: TimelineEvent) {
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
        { id: "original", label: "Eredeti ár", value: money.format(event.offer.originalHuf) },
        { id: "expiry", label: "Érvényes", value: date.format(new Date(event.offer.expiresAt)) },
        { id: "status", label: "Állapot", value: offerStatus[event.offer.status] ?? event.offer.status },
        { id: "when", label: "Időpont", value: date.format(new Date(event.createdAt)) },
      ]}
    />;
  }
  return <ListingCard key={event.id} title={event.kind === "activity" ? "Beszélgetés megnyitva" : event.senderRole === "seller" ? "Eladó" : "Vásárló"} description={event.body ?? "A beszélgetés megnyitásának rendszernaplója."} mediaSeed={event.id} mediaOverlay={event.kind === "activity" ? "Esemény" : "Üzenet"} metadata={[{ id: "when", label: "Időpont", value: date.format(new Date(event.createdAt)) }]} />;
}

export default async function SellerConversationPage({ params, searchParams }: { params: Promise<{ sellerSlug: string; conversationId: string }>; searchParams: Promise<{ preview?: string; saved?: string; error?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const { sellerSlug, conversationId } = await params;
  let result;
  let pricing;
  try { [result, pricing] = await Promise.all([conversationTimeline(user.id, conversationId), getSellerSettings(user.id, sellerSlug)]); if (result.conversation.seller.slug !== sellerSlug || result.role !== "seller") redirect("/account?error=forbidden"); } catch { redirect("/account?error=forbidden"); }
  const query = await searchParams;
  const returnTo = `/seller/${sellerSlug}/conversations/${conversationId}`;
  let history: Awaited<ReturnType<typeof customerHistory>> | null = null;
  if (result.conversation.customer) { try { history = await customerHistory(user.id, sellerSlug, result.conversation.customer.id, 6); } catch { history = null; } }
  let recommendation: Awaited<ReturnType<typeof recommendationPreview>> | null = null;
  if (query.preview) { try { recommendation = await recommendationPreview(user.id, sellerSlug, query.preview); } catch { recommendation = null; } }
  return <Shell active="account">
    <PageHeader title={result.conversation.customer?.displayName ?? result.conversation.buyer.displayName} description="Eladóhoz kötött beszélgetés vásárlási kontextussal, ajánlási előnézettel és ajánlatküldéssel." eyebrow="Beszélgetés" actions={<GdsButton component="a" href={`/seller/${sellerSlug}/conversations`} variant="default">Összes beszélgetés</GdsButton>} />
    {query.saved === "message" ? <BannerNotice severity="success" variant="compact" message="Az üzenet rögzítve." /> : null}
    {query.saved === "offer" ? <BannerNotice severity="success" variant="compact" message="Az ajánlat bekerült a beszélgetésbe." /> : null}
    {query.error ? <BannerNotice severity="error" variant="compact" message={errors[query.error] ?? "Az üzenet nem küldhető el."} /> : null}
    <RealtimeThread conversationId={conversationId} />
    {history ? <SectionPanel title="Vásárlói cockpit" description="A beszélgetéshez kötött rendelési bizonyítékok és következő ajánlási műveletek." action={<div className="button-row"><StatusBadge status={history.customer.privacyStatus === "active" ? "success" : "warning"}>{privacyStatus[history.customer.privacyStatus] ?? history.customer.privacyStatus}</StatusBadge><form action={conversationRecommendationPreviewAction.bind(null, returnTo, sellerSlug, history.customer._id.toString())}><GdsSelect name="channel" label="Csatorna" defaultValue="email" data={[{ value: "email", label: "E-mail" }, { value: "postal", label: "Postai levél" }]} /><GdsButton type="submit" variant="default" leftSection={<GdsIcon name="Preview" decorative />}>Ajánlás előnézete</GdsButton></form></div>}>
      {!history.purchases.length ? <EmptyState title="Nincs vásárlási előzmény" description="Ajánlás csak importált vásárlási bizonyíték alapján készülhet." /> : <GdsGrid columns={{ base: 1, md: 3 }}>
        {history.purchases.map((purchase) => <ListingCard
          key={purchase.id}
          title={purchase.productName}
          description={`${purchase.quantity} db · ${date.format(new Date(purchase.purchasedAt))}`}
          price={money.format(purchase.totalHuf)}
          mediaSeed={purchase.id}
          mediaOverlay={purchaseStatus[purchase.status] ?? purchase.status}
          metadata={[{ id: "order", label: "Rendelés", value: `${purchase.orderId} / ${purchase.lineId}` }, { id: "sku", label: "Cikkszám", value: purchase.productSku }]}
        />)}
      </GdsGrid>}
    </SectionPanel> : null}
    {recommendation ? <SectionPanel title="Ajánlási előnézet" description={`Szabályverzió: ${recommendation.ruleVersion}. Az ajánlat létrehozáskor pillanatképként kerül a beszélgetésbe.`}>
      {recommendation.status === "blocked" ? <BannerNotice severity="warning" variant="compact" message={`Az előnézet letiltva: ${recommendation.exclusionReasons.join(", ")}.`} /> : null}
      {recommendation.status === "empty" ? <EmptyState title="Nincs ajánlható termék" description="Az aktív katalógus és a vásárlási bizonyítékok alapján nincs találat." /> : null}
      {recommendation.status === "eligible" ? <GdsGrid columns={{ base: 1, md: 2 }}>
        {recommendation.recommendations.map((item: { productId: string; productName: string; reasonText: string; priceHuf: number; score: number; productSku: string; reasonCode: string; evidencePurchaseIds: string[] }) => <ListingCard
          key={item.productId}
          title={item.productName}
          description={item.reasonText}
          price={money.format(item.priceHuf)}
          mediaSeed={item.productId}
          mediaOverlay={`${item.score} pont`}
          metadata={[{ id: "sku", label: "Cikkszám", value: item.productSku }, { id: "rule", label: "Szabály", value: item.reasonCode }, { id: "evidence", label: "Bizonyíték", value: `${item.evidencePurchaseIds.length} vásárlási tétel` }]}
          primaryAction={<form action={createConversationOfferAction.bind(null, returnTo, sellerSlug, recommendation.id, item.productId)}>
            <DiscountInput settings={pricing.settings} />
            <TextInput name="expiresAt" label="Érvényesség vége" type="datetime-local" required />
            <GdsButton type="submit" leftSection={<GdsIcon name="Tag" decorative />}>Ajánlat küldése</GdsButton>
          </form>}
        />)}
      </GdsGrid> : null}
    </SectionPanel> : null}
    <SectionPanel title="Idővonal" description="Az események létrehozási idő és azonosító szerint rendezettek." divided={false}>
      {!result.events.length ? <EmptyState title="Még nincs esemény" description="Az első üzenet itt fog megjelenni." /> : <GdsGrid columns={{ base: 1 }}>
        {result.events.map(timelineCard)}
      </GdsGrid>}
    </SectionPanel>
    <SectionPanel title="Új üzenet" description="A mentési ismétlés ugyanahhoz a klienskéréshez csak egy üzenetet rögzít.">
      <form action={sendConversationMessageAction.bind(null, conversationId, returnTo)}><GdsTextarea name="body" label="Üzenet" minRows={4} required maxLength={2000} /><GdsButton type="submit">Üzenet rögzítése</GdsButton></form>
    </SectionPanel>
  </Shell>;
}
