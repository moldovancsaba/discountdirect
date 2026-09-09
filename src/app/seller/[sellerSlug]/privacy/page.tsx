import { redirect } from "next/navigation";
import { BannerNotice, Button as GdsButton, EmptyState, GdsGrid, GdsIcon, ListingCard, PageHeader, SectionPanel, Select as GdsSelect, TextInput } from "@discountdirect/gds-client";
import { currentUser } from "@/auth/service";
import { Shell } from "@/components/shell";
import { sellerPrivacyRequests } from "@/privacy/service";
import { advancePrivacyRequestAction } from "./actions";

export const dynamic = "force-dynamic";
const requestType: Record<string, string> = { access_export: "Adatmásolat", restriction: "Korlátozás", erasure: "Törlés" };
const requestStatus: Record<string, string> = { requested: "Beérkezett", processing: "Feldolgozás alatt", completed: "Teljesítve", failed: "Sikertelen" };
const date = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Budapest" });

function nextStatuses(status: string) {
  if (status === "requested") return [{ value: "processing", label: "Feldolgozás megkezdése" }, { value: "failed", label: "Sikertelenként jelölés" }];
  if (status === "processing") return [{ value: "completed", label: "Teljesítés" }, { value: "failed", label: "Sikertelenként jelölés" }];
  if (status === "failed") return [{ value: "processing", label: "Újrapróbálás" }];
  return [];
}

export default async function SellerPrivacyPage({ params, searchParams }: { params: Promise<{ sellerSlug: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const { sellerSlug } = await params;
  let privacy;
  try { privacy = await sellerPrivacyRequests(user.id, sellerSlug); } catch { redirect("/account?error=forbidden"); }
  const query = await searchParams;
  return <Shell active="account">
    <PageHeader
      title="Adatkezelési kérelmek"
      description={`${privacy.seller.name} vásárlóinak kérelmei. A státuszváltások és az indoklás tartósan megmaradnak.`}
      eyebrow="Eladói adatkezelés"
      actions={<GdsButton component="a" href={`/seller/${sellerSlug}/customers`} variant="default" leftSection={<GdsIcon name="Users" decorative />}>Vásárlói főkönyv</GdsButton>}
    />
    {query.saved === "request" ? <BannerNotice variant="compact" severity="success" message="A kérelem állapota frissült." /> : null}
    {query.error ? <BannerNotice variant="compact" severity="error" message="Az állapotváltás nem hajtható végre. Frissítsd az oldalt, majd ellenőrizd a kérelem aktuális állapotát." /> : null}
    <BannerNotice severity="warning" title="Ellenőrzött feldolgozás szükséges" message="Törlés teljesítése anonimizálja az ügyfélkapcsolatot és leállítja a marketinget, de a pénzügyi bizonylati tételeket megőrzi. Csak ellenőrzött személyazonosság és dokumentált döntés után zárd le a kérelmet." />
    <SectionPanel title="Feldolgozási sor" description="Legfeljebb a 100 legutóbbi kérelem, a legújabbal kezdve." divided={false}>
      {!privacy.requests.length ? <EmptyState title="Nincs feldolgozandó kérelem" description="A vásárlók által beküldött kérelmek itt jelennek meg." /> : null}
      <GdsGrid columns={{ base: 1, md: 2 }}>
        {privacy.requests.map((request) => {
          const options = nextStatuses(request.status);
          return <ListingCard
            key={request.id}
            title={request.buyerName}
            description={request.buyerEmail}
            mediaSeed={request.id}
            mediaOverlay={requestType[request.type] ?? request.type}
            metadata={[{ id: "requested", label: "Beérkezett", value: date.format(new Date(request.requestedAt)) }, { id: "status", label: "Állapot", value: requestStatus[request.status] ?? request.status }]}
            revealContent={options.length ? <form action={advancePrivacyRequestAction.bind(null, sellerSlug, request.id)}>
              <GdsSelect name="status" label="Következő állapot" defaultValue={options[0].value} data={options} />
              <TextInput name="resolution" label="Feldolgozási jegyzet" required maxLength={500} />
              <GdsButton type="submit" leftSection={<GdsIcon name="Save" decorative />}>Állapot mentése</GdsButton>
            </form> : <BannerNotice variant="compact" severity={request.status === "completed" ? "success" : "error"} message={request.resolution ?? "A kérelem lezárult."} />}
          />;
        })}
      </GdsGrid>
    </SectionPanel>
  </Shell>;
}
