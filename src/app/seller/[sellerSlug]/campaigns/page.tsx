import { redirect } from "next/navigation";
import { BannerNotice, Button as GdsButton, EmptyState, GdsGrid, GdsIcon, ListingCard, NumberInput, PageHeader, SectionPanel, Select as GdsSelect, StatusBadge } from "@discountdirect/gds-client";
import { currentUser } from "@/auth/service";
import { listProducts } from "@/catalog/service";
import { getCampaignPreview, listCampaigns } from "@/campaigns/service";
import { Shell } from "@/components/shell";
import { businessLabel } from "@/presentation/labels";
import { cancelCampaignAction, launchFlashCampaignAction, previewFlashCampaignAction } from "./actions";
import { getSellerSettings } from "@/settings/service";
import { DiscountInput } from "@/components/discount-input";

export const dynamic = "force-dynamic";
const money = new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Budapest" });
const percent = new Intl.NumberFormat("hu-HU", { style: "percent", maximumFractionDigits: 1 });
const channelLabel: Record<string, string> = { email: "E-mail", postal: "Postai" };
type PreviewAudienceItem = { buyerUserId: string; customerId: string; recommendationPreviewId: string; reasonCode: string; reasonText: string; evidencePurchaseIds: string[] };
function campaignMetadata(campaign: Awaited<ReturnType<typeof listCampaigns>>["campaigns"][number], reportingReady: boolean) {
  return [{ id: "discount", label: "Kedvezmény", value: `${campaign.discountPct}%` }, { id: "reference", label: "30 napos összehasonlító ár", value: money.format(campaign.referencePriceHuf) }, ...(reportingReady ? [{ id: "treatment", label: "Célcsoport vásárlási arány", value: percent.format(campaign.measurement.treatmentRate) }, { id: "holdout", label: "Kontroll vásárlási arány", value: campaign.measurement.holdoutRate === null ? "Nincs kontrollminta" : percent.format(campaign.measurement.holdoutRate) }, { id: "lift", label: "Mért különbség", value: campaign.measurement.incrementalRate === null ? "Nem mérhető" : `${campaign.measurement.incrementalRate >= 0 ? "+" : ""}${percent.format(campaign.measurement.incrementalRate)}${campaign.measurement.comparable ? "" : " · kis minta"}` }] : []), { id: "remaining", label: "Hátralévő keret", value: `${campaign.remaining} / ${campaign.quantity} db` }];
}

export default async function CampaignsPage({ params, searchParams }: { params: Promise<{ sellerSlug: string }>; searchParams: Promise<{ preview?: string; saved?: string; error?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const { sellerSlug } = await params;
  let catalog;
  let data;
  let pricing;
  try { [catalog, data, pricing] = await Promise.all([listProducts(user.id, sellerSlug, true), listCampaigns(user.id, sellerSlug), getSellerSettings(user.id, sellerSlug)]); } catch { redirect("/account?error=forbidden"); }
  const query = await searchParams;
  const products = catalog.products.filter((product) => product.active && product.stock > 0);
  let preview: Awaited<ReturnType<typeof getCampaignPreview>> | null = null;
  if (query.preview) { try { preview = await getCampaignPreview(user.id, sellerSlug, query.preview); } catch { preview = null; } }

  return <Shell active="account">
    <PageHeader eyebrow="Eladói munkatér" title="Villámkampányok" description="A kampány először közönség- és árpillanatképet készít. Indítás csak az előnézet jóváhagyása után hoz létre ajánlatokat." actions={<GdsButton component="a" href={`/seller/${sellerSlug}`} variant="default">Katalógus</GdsButton>} />
    {query.saved ? <BannerNotice variant="compact" severity="success" message={query.saved === "cancelled" ? "A kampány lezárult, a foglalások felszabadultak." : "A villámkampány és személyes ajánlatai létrejöttek."} /> : null}
    {query.error ? <BannerNotice variant="compact" severity="error" message="A kampány nem indítható. Ellenőrizd a készletet, időablakot és elérhető, hozzájáruló címzetteket." /> : null}

    <SectionPanel title="Villámkampány előnézete" description="Az előnézet még nem küld ajánlatot. A célközönség a meglévő, jogosult ajánlási előnézetekből és csatornahozzájárulásból áll.">
      {products.length ? <form className="catalog-form" action={previewFlashCampaignAction.bind(null, sellerSlug)}>
        <GdsSelect name="productId" label="Termék" required data={products.map((product) => ({ value: product.id, label: `${product.name} · ${product.stock} db · ${money.format(product.priceHuf)}` }))} />
        <DiscountInput settings={pricing.settings} />
        <NumberInput name="quantity" label="Legfeljebb foglalható darab" required min={1} max={1000} step={1} allowDecimal={false} defaultValue={1} />
        <GdsSelect name="channel" label="Kimenő csatorna" required data={[{ value: "email", label: "E-mail" }, { value: "postal", label: "Postai" }]} />
        <GdsSelect name="expiresAt" label="Időablak" required data={[{ value: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), label: "6 óra" }, { value: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), label: "24 óra" }, { value: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), label: "48 óra" }]} />
        <GdsButton type="submit" leftSection={<GdsIcon name="Preview" decorative />}>Előnézet készítése</GdsButton>
      </form> : <EmptyState title="Nincs kampányolható termék" description="Aktív, pozitív készletű termék szükséges." />}
    </SectionPanel>

    {preview ? <SectionPanel title="Jóváhagyásra váró előnézet" description="Csak a célcsoport kap ajánlatot. A kontrollcsoport nem kap kampányüzenetet, és később az összehasonlítható vásárlási eredmény mérését szolgálja." action={preview.status === "ready" ? <form action={launchFlashCampaignAction.bind(null, sellerSlug, preview.id)}><GdsButton type="submit" leftSection={<GdsIcon name="Send" decorative />}>Kampány indítása</GdsButton></form> : <StatusBadge status="neutral">{businessLabel(preview.status)}</StatusBadge>}>
      <ListingCard
        title={preview.product.name}
        description={`${preview.audienceSize} célzott címzett · ${preview.holdoutSize} fős kontrollcsoport · ${channelLabel[preview.channel] ?? preview.channel} · lejár: ${date.format(new Date(preview.expiresAt))}`}
        price={money.format(preview.priceHuf)}
        mediaSeed={preview.id}
        mediaOverlay={`${preview.discountPct}% kedvezmény`}
        metadata={[{ id: "reference", label: "30 napos összehasonlító ár", value: money.format(preview.referencePriceHuf) }, { id: "catalog", label: "Aktuális katalógusár", value: money.format(preview.originalHuf) }, { id: "quantity", label: "Foglalási keret", value: `${preview.quantity} db` }, { id: "holdout", label: "Kontrollszabály", value: `${preview.holdoutPct}% · ${preview.holdoutMode === "pooled" ? "közös csoport" : "kampányonként"}` }, { id: "status", label: "Állapot", value: businessLabel(preview.status) }]}
      />
      <GdsGrid columns={{ base: 1, md: 2 }}>
        {preview.audience.slice(0, 6).map((item: PreviewAudienceItem) => <ListingCard key={`${item.buyerUserId}-${item.recommendationPreviewId}`} title={businessLabel(item.reasonCode)} description={item.reasonText} mediaSeed={item.customerId} mediaOverlay={`${item.evidencePurchaseIds.length} vásárlási bizonyíték`} />)}
      </GdsGrid>
    </SectionPanel> : null}

    <SectionPanel title="Korábbi kampányok" description="A vásárlási arányok az importált, kampányidőszakban rögzített termékvásárlásokból készülnek. Kis minta esetén az eredmény tájékoztató, nem bizonyított növekmény.">
      {!data.reportingReady && data.campaigns.length ? <BannerNotice severity="warning" message="A kampánymérés még készül. A következő sikeres riportgenerációig nem jelenítünk meg részleges konverziós adatokat." /> : null}
      {!data.campaigns.length ? <EmptyState title="Még nincs kampány" description="Készíts előnézetet, majd indítsd el az első hozzájáruláson alapuló villámkampányt." /> : <GdsGrid columns={{ base: 1, md: 2 }}>{data.campaigns.map((campaign) => <ListingCard key={campaign.id} title={campaign.product.name} description={`${campaign.audienceSize} célzott · ${campaign.holdoutSize} kontroll · ${channelLabel[campaign.channel] ?? campaign.channel} · lejár: ${date.format(new Date(campaign.expiresAt))}`} price={money.format(campaign.priceHuf)} mediaSeed={campaign.id} mediaOverlay={businessLabel(campaign.status)} metadata={campaignMetadata(campaign, data.reportingReady)} primaryAction={campaign.status === "active" ? <form action={cancelCampaignAction.bind(null, sellerSlug, campaign.id)}><GdsButton type="submit" color="red" variant="default">Kampány leállítása</GdsButton></form> : <StatusBadge status="info">{businessLabel(campaign.status)}</StatusBadge>} />)}</GdsGrid>}
    </SectionPanel>
  </Shell>;
}
