import { redirect } from "next/navigation";
import { BannerNotice, Button as GdsButton, EmptyState, GdsIcon, PageHeader, SectionPanel, SimpleDataTable, StatusBadge } from "@discountdirect/gds-client";
import { currentUser } from "@/auth/service";
import { Shell } from "@/components/shell";
import { listSellerDeliveries } from "@/delivery/service";
import { businessLabel } from "@/presentation/labels";
import { listPostalFulfillments } from "@/postal/fulfillment";
import { transitionPostalFulfillmentAction } from "./actions";

export const dynamic = "force-dynamic";
const date = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Budapest" });
const statusTone: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = { queued: "info", processing: "info", sent: "success", unsupported: "warning", suppressed: "neutral", retryable_failed: "danger", cancelled: "neutral", bounced: "danger", complained: "danger" };
const channelLabel: Record<string, string> = { in_app: "Alkalmazáson belül", email: "E-mail", postal: "Postai" };

export default async function DeliveriesPage({ params,searchParams }: { params: Promise<{ sellerSlug: string }>;searchParams:Promise<{saved?:string;error?:string}> }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const { sellerSlug } = await params;
  let data;
  let postal;try { [data,postal] = await Promise.all([listSellerDeliveries(user.id, sellerSlug),listPostalFulfillments(user.id,sellerSlug)]); } catch { redirect("/account?error=forbidden"); }const query=await searchParams;
  return <Shell active="account">
    <PageHeader title="Kézbesítési napló" description="Minden üzenetnél követhető, melyik csatornán indult el, célba ért-e, vagy miért nem küldhető." eyebrow={data.seller.name} />
    {query.saved?<BannerNotice severity="success" variant="compact" message={query.saved==="mark_posted"?"A postai szolgáltatónak történő átadás rögzítve. Ez nem kézbesítési igazolás.":"A nyomtatás rögzítve."}/>:null}{query.error?<BannerNotice severity="error" variant="compact" message="Az állapot nem módosítható. Frissítsd az oldalt, majd ellenőrizd az előző lépést."/>:null}
    <SectionPanel title="Postai teljesítési sor" description="A letöltés, nyomtatás és postai átadás külön auditált lépés. A postai átadás nem jelenti azt, hogy a címzett megkapta a levelet.">
      {!postal.fulfillments.length?<EmptyState title="Nincs nyomtatható postai ajánlat" description="Elfogadott postai ajánlatból, aktív hozzájárulással és címmel hozható létre PDF."/>:<div className="table-wrap"><SimpleDataTable rows={postal.fulfillments.map((item)=>({createdAt:date.format(new Date(item.createdAt)),status:<StatusBadge status={item.status==="posted"?"success":item.status==="printed"?"warning":"info"}>{item.status==="posted"?"Átadva a postai szolgáltatónak":item.status==="printed"?"Kinyomtatva":"Nyomtatásra kész"}</StatusBadge>,printed:item.printedAt?date.format(new Date(item.printedAt)):"—",posted:item.postedAt?date.format(new Date(item.postedAt)):"—",actions:<div className="inline-actions"><GdsButton component="a" href={`/api/sellers/${sellerSlug}/artifacts/${item.artifactId}`} variant="default" leftSection={<GdsIcon name="Download" decorative/>}>PDF letöltése</GdsButton>{item.status==="ready"?<form action={transitionPostalFulfillmentAction.bind(null,sellerSlug,"mark_printed",item.id,item.version)}><GdsButton type="submit" leftSection={<GdsIcon name="Print" decorative/>}>Nyomtatás rögzítése</GdsButton></form>:null}{item.status==="printed"?<form action={transitionPostalFulfillmentAction.bind(null,sellerSlug,"mark_posted",item.id,item.version)}><GdsButton type="submit" leftSection={<GdsIcon name="Send" decorative/>}>Postai átadás rögzítése</GdsButton></form>:null}</div>}))} columns={[{key:"createdAt",header:"Létrejött"},{key:"status",header:"Állapot"},{key:"printed",header:"Nyomtatva"},{key:"posted",header:"Átadva"},{key:"actions",header:"Műveletek"}]}/></div>}
    </SectionPanel>
    <SectionPanel title="Legutóbbi kézbesítési rekordok" description="A napló nem kézbesítési ígéret; minden sor a pillanatnyi, visszakereshető csatornaállapotot mutatja.">
      {!data.deliveries.length ? <EmptyState title="Még nincs kézbesítési rekord" description="Ajánlat, kampány vagy automatizmus létrehozásakor jelenik meg." /> : <div className="table-wrap"><SimpleDataTable rows={data.deliveries.map((item) => ({ createdAt: date.format(new Date(item.createdAt)), kind: businessLabel(item.kind), channel: channelLabel[item.channel] ?? businessLabel(item.channel), status: <StatusBadge status={statusTone[item.status] ?? "neutral"}>{businessLabel(item.status)}</StatusBadge>, reason: businessLabel(item.reasonCode), attempts: item.attemptCount }))} columns={[{ key: "createdAt", header: "Létrejött" }, { key: "kind", header: "Típus" }, { key: "channel", header: "Csatorna" }, { key: "status", header: "Állapot" }, { key: "reason", header: "Részletek" }, { key: "attempts", header: "Próbák" }]} /></div>}
    </SectionPanel>
  </Shell>;
}
