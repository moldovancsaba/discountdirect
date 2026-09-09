import { redirect } from "next/navigation";
import { BannerNotice, Button as GdsButton, Checkbox, GdsIcon, PageHeader, SectionPanel, Select as GdsSelect, SimpleDataTable, StatusBadge } from "@discountdirect/gds-client";
import { currentUser } from "@/auth/service";
import { Shell } from "@/components/shell";
import { buyerPrivacy } from "@/privacy/service";
import { createPrivacyRequestAction, savePreferencesAction } from "./actions";

export const dynamic = "force-dynamic";
const requestType: Record<string, string> = { access_export: "Adatmásolat", restriction: "Adatkezelés korlátozása", erasure: "Törlési kérelem" };
const requestStatus: Record<string, string> = { requested: "Beérkezett", processing: "Feldolgozás alatt", completed: "Teljesítve", failed: "Sikertelen – újrapróbálható" };
const date = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Budapest" });

export default async function PreferencesPage({ params, searchParams }: { params: Promise<{ sellerSlug: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const { sellerSlug } = await params;
  let privacy;
  try { privacy = await buyerPrivacy(user.id, sellerSlug); } catch { redirect("/account?error=forbidden"); }
  const query = await searchParams;
  const email = privacy.preferences.find((item) => item.channel === "email")!;
  const postal = privacy.preferences.find((item) => item.channel === "postal")!;
  const marketingDisabled = !["active", "not_linked"].includes(privacy.customerStatus);
  return <Shell active="account">
    <PageHeader
      title="Adatkezelés és kapcsolattartás"
      description={`${privacy.seller.name} külön kezeli a hozzájárulásaidat. A módosítás azonnal érvényes a későbbi marketingküldésekre.`}
      eyebrow="Vásárlói beállítások"
      actions={<GdsButton component="a" href={`/buyer/${sellerSlug}`} variant="default" leftSection={<GdsIcon name="History" decorative />}>Vásárlási előzmények</GdsButton>}
    />
    {query.saved === "preferences" ? <BannerNotice variant="compact" severity="success" message="A kapcsolattartási beállítások mentve." /> : null}
    {query.saved === "request" ? <BannerNotice variant="compact" severity="success" message="A kérelmet rögzítettük. Az állapota ezen az oldalon követhető." /> : null}
    {query.error ? <BannerNotice variant="compact" severity="error" message="A művelet nem hajtható végre. Ellenőrizd az aktuális adatkezelési állapotot." /> : null}
    {marketingDisabled ? <BannerNotice title="A marketing le van tiltva" severity="warning" message="Korlátozott vagy törlésre jelölt kapcsolatnál új hozzájárulás nem adható." /> : null}
    <SectionPanel title="Marketingcsatornák" description={`Adatkezelési tájékoztató verziója: ${privacy.noticeVersion}. A jelölések önkéntesek és bármikor visszavonhatók.`}>
      <form action={savePreferencesAction.bind(null, sellerSlug)}>
        <Checkbox name="email" value="yes" label="Személyre szabott ajánlatokat kérek e-mailben" defaultChecked={email.subscribed} disabled={marketingDisabled} />
        <Checkbox name="postal" value="yes" label="Személyre szabott ajánlatokat kérek postai levélben" defaultChecked={postal.subscribed} disabled={marketingDisabled} />
        <GdsButton type="submit" leftSection={<GdsIcon name="Save" decorative />} disabled={marketingDisabled}>Beállítások mentése</GdsButton>
      </form>
    </SectionPanel>
    <SectionPanel title="Adatkezelési kérelem" description="A már beérkezett, azonos típusú kérelem nem duplázódik. A vásárlási bizonylatok megőrzését jogszabály írhatja elő.">
      <form action={createPrivacyRequestAction.bind(null, sellerSlug)}>
        <GdsSelect name="type" label="Kérelem típusa" defaultValue="access_export" data={[{ value: "access_export", label: "Adatmásolat kérése" }, { value: "restriction", label: "Adatkezelés korlátozása" }, { value: "erasure", label: "Személyes adatok törlése" }]} />
        <GdsButton type="submit" leftSection={<GdsIcon name="Send" decorative />}>Kérelem elküldése</GdsButton>
      </form>
    </SectionPanel>
    <SectionPanel title="Korábbi kérelmek" description="A legutóbbi 20 kérelem és feldolgozási állapot.">
      <div className="table-wrap"><SimpleDataTable
        rows={privacy.requests.map((request) => ({ type: requestType[request.type] ?? request.type, requested: date.format(new Date(request.requestedAt)), status: requestStatus[request.status] ?? request.status, result: request.status === "completed" && request.type === "access_export" ? <GdsButton component="a" href={`/api/buyer/${sellerSlug}/privacy-export?requestId=${request.id}`} variant="default">JSON letöltése</GdsButton> : request.resolution ?? "—" }))}
        columns={[{ key: "type", header: "Kérelem" }, { key: "requested", header: "Beérkezett" }, { key: "status", header: "Állapot" }, { key: "result", header: "Eredmény" }]}
      /></div>
      {!privacy.requests.length ? <StatusBadge status="info">Még nincs kérelem</StatusBadge> : null}
    </SectionPanel>
  </Shell>;
}
