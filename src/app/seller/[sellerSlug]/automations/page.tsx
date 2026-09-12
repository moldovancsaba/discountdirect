import { redirect } from "next/navigation";
import { BannerNotice, Button as GdsButton, EmptyState, GdsGrid, GdsIcon, ListingCard, NumberInput, PageHeader, SectionPanel, Select as GdsSelect, SimpleDataTable, StatusBadge, TextInput } from "@discountdirect/gds-client";
import { currentUser } from "@/auth/service";
import { listAutomations } from "@/automations/service";
import { Shell } from "@/components/shell";
import { listCustomers } from "@/purchases/service";
import { automationStatusAction, createAutomationAction, runAutomationAction } from "./actions";

export const dynamic = "force-dynamic";
const date = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Budapest" });
const cadenceLabel: Record<string, string> = { weekly: "Hetente", fortnightly: "Kéthetente", monthly: "Havonta" };
const messages: Record<string, string> = { created: "Az automatizmus létrejött.", run: "Az automatizmus futása rögzítve.", status: "Az automatizmus állapota frissült." };

function datetimeLocal(value: Date) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default async function AutomationsPage({ params, searchParams }: { params: Promise<{ sellerSlug: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const { sellerSlug } = await params;
  let data;
  let customers;
  try {
    [data, customers] = await Promise.all([listAutomations(user.id, sellerSlug), listCustomers(user.id, sellerSlug)]);
  } catch {
    redirect("/account?error=forbidden");
  }
  const query = await searchParams;
  const eligibleCustomers = customers.customers.filter((customer) => customer.emailNormalized && customer.privacyStatus === "active");
  return <Shell active="account">
    <PageHeader title="Ajánlatlista automatizmusok" description="Időzített, hozzájáruláson alapuló ajánlatlisták. A futás kézbesítési naplót hoz létre, de nem állítja, hogy e-mailt vagy postát küldött." eyebrow={data.seller.name} actions={<div className="button-row"><GdsButton component="a" href={`/seller/${sellerSlug}/deliveries`} variant="default" leftSection={<GdsIcon name="Send" decorative />}>Kézbesítési napló</GdsButton><StatusBadge status="info">{data.automations.length} automatizmus</StatusBadge></div>} />
    {query.saved && messages[query.saved] ? <BannerNotice variant="compact" severity="success" message={messages[query.saved]} /> : null}
    {query.error ? <BannerNotice variant="compact" severity="error" message="Az automatizmus nem hajtható végre. Ellenőrizd a vevőt, hozzájárulást és ajánlási előzményeket." /> : null}
    <SectionPanel title="Új automatizmus" description="A vevőnek aktív kapcsolat, e-mail-cím és marketinghozzájárulás kell. A futás legfeljebb tíz terméket rögzít egy listába.">
      {eligibleCustomers.length ? <form className="catalog-form" action={createAutomationAction.bind(null, sellerSlug)}>
        <GdsSelect name="customerId" label="Vásárló" required data={eligibleCustomers.map((customer) => ({ value: customer.id, label: `${customer.displayName} · ${customer.emailNormalized}` }))} />
        <GdsSelect name="channel" label="Csatorna" defaultValue="email" data={[{ value: "email", label: "E-mail lista" }, { value: "postal", label: "Postai lista" }]} />
        <GdsSelect name="cadence" label="Gyakoriság" defaultValue="weekly" data={[{ value: "weekly", label: "Hetente" }, { value: "fortnightly", label: "Kéthetente" }, { value: "monthly", label: "Havonta" }]} />
        <NumberInput name="productLimit" label="Termékek száma" defaultValue={5} min={1} max={10} step={1} allowDecimal={false} required />
        <TextInput name="nextRunAt" label="Első futás" type="datetime-local" defaultValue={datetimeLocal(new Date())} required />
        <GdsButton type="submit" leftSection={<GdsIcon name="Calendar" decorative />}>Automatizmus mentése</GdsButton>
      </form> : <EmptyState title="Nincs alkalmas vásárló" description="Aktív, e-mailes, hozzájáruló vásárlóra van szükség." />}
    </SectionPanel>
    <SectionPanel title="Ütemezések" description="A kézi futtatás ugyanazt a tartós run-ledgert használja, mint a cron.">
      {!data.automations.length ? <EmptyState title="Még nincs automatizmus" description="Hozd létre az első személyre szabott ajánlatlista ütemezést." /> : null}
      <GdsGrid columns={{ base: 1, md: 2 }}>
        {data.automations.map((automation) => <ListingCard key={automation.id} title={automation.customerName} description={`${cadenceLabel[automation.cadence]} · következő futás: ${date.format(new Date(automation.nextRunAt))}`} mediaSeed={automation.id} mediaOverlay={automation.status} metadata={[{ id: "channel", label: "Csatorna", value: automation.channel === "email" ? "E-mail" : "Postai" }, { id: "limit", label: "Termékszám", value: automation.productLimit }, { id: "last", label: "Utolsó futás", value: automation.lastRunAt ? date.format(new Date(automation.lastRunAt)) : "Még nem futott" }]} primaryAction={<div className="button-row"><form action={runAutomationAction.bind(null, sellerSlug, automation.id)}><GdsButton type="submit" leftSection={<GdsIcon name="Play" decorative />}>Futtatás most</GdsButton></form><form action={automationStatusAction.bind(null, sellerSlug, automation.id, automation.version, automation.status === "active" ? "paused" : "active")}><GdsButton type="submit" variant="default">{automation.status === "active" ? "Szüneteltetés" : "Újraindítás"}</GdsButton></form></div>} />)}
      </GdsGrid>
    </SectionPanel>
    <SectionPanel title="Legutóbbi ajánlatlisták" description="A vevői felületen és a nyomtatható levélben is ezek a pillanatképek jelennek meg.">
      {!data.lists.length ? <EmptyState title="Még nincs létrehozott lista" description="Futtass egy automatizmust ellenőrzött ajánlási előnézettel." /> : <SimpleDataTable rows={data.lists.map((list) => ({ customer: list.customerName, products: list.products.length, channel: list.channel, status: list.status, until: date.format(new Date(list.availableUntil)) }))} columns={[{ key: "customer", header: "Vásárló" }, { key: "products", header: "Termékek" }, { key: "channel", header: "Csatorna" }, { key: "status", header: "Állapot" }, { key: "until", header: "Elérhető" }]} />}
    </SectionPanel>
  </Shell>;
}
