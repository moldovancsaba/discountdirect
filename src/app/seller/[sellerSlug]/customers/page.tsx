import { redirect } from "next/navigation";
import { BannerNotice, Button as GdsButton, EmptyState, GdsGrid, GdsIcon, ListingCard, PageHeader, SectionPanel, Select as GdsSelect, SimpleDataTable, StatusBadge, Textarea as GdsTextarea, TextInput } from "@discountdirect/gds-client";
import { currentUser } from "@/auth/service";
import { Shell } from "@/components/shell";
import { customerHistory, listCustomers, purchaseImportBatch } from "@/purchases/service";
import { applyPurchasesAction, customerPrivacyAction, previewPurchasesAction, purchaseStatusAction } from "./actions";

export const dynamic = "force-dynamic";
const money = new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Budapest" });
const messages: Record<string, string> = { imported: "A vásárlási előzmények importálva.", corrected: "A tétel állapota frissült.", privacy: "Az adatkezelési állapot frissült." };
const errors: Record<string, string> = { INVALID: "Ellenőrizd a megadott adatokat.", TOO_LARGE: "Az import 1–200 sort tartalmazhat.", STALE: "A tétel időközben megváltozott. Frissítsd az oldalt." };
const statusLabel: Record<string, string> = { purchased: "Vásárlás", refunded: "Visszatérítve", corrected: "Helyesbítve" };
const privacyLabel: Record<string, string> = { active: "Aktív", restricted: "Korlátozott", erasure_requested: "Törlésre jelölve", erased: "Anonimizált" };

export default async function CustomersPage({ params, searchParams }: { params: Promise<{ sellerSlug: string }>; searchParams: Promise<{ customer?: string; batch?: string; saved?: string; error?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const { sellerSlug } = await params;
  let result;
  try { result = await listCustomers(user.id, sellerSlug); } catch { redirect("/account?error=forbidden"); }
  const query = await searchParams;
  let selected: Awaited<ReturnType<typeof customerHistory>> | null = null;
  if (query.customer) { try { selected = await customerHistory(user.id, sellerSlug, query.customer); } catch { selected = null; } }
  let batch: Awaited<ReturnType<typeof purchaseImportBatch>> | null = null;
  if (query.batch) { try { batch = await purchaseImportBatch(user.id, sellerSlug, query.batch); } catch { batch = null; } }
  return <Shell active="account">
    <PageHeader title={result.seller.name} description="Eladóhoz kötött vásárlók és időrendi rendelési tételek. A visszatérített és helyesbített tételek nem számítanak bele a költésbe." eyebrow="Vásárlói főkönyv" actions={<div className="button-row"><GdsButton component="a" href={`/seller/${sellerSlug}`} variant="default" leftSection={<GdsIcon name="Package" decorative />}>Termékkatalógus</GdsButton><GdsButton component="a" href={`/seller/${sellerSlug}/privacy`} variant="default" leftSection={<GdsIcon name="Settings" decorative />}>Adatkezelési kérelmek</GdsButton><StatusBadge status="info">{result.customers.length} kapcsolat</StatusBadge></div>} />
    {query.saved && messages[query.saved] ? <BannerNotice variant="compact" severity="success" message={messages[query.saved]} /> : null}
    {query.error ? <BannerNotice variant="compact" severity="error" message={errors[query.error] ?? "A művelet nem hajtható végre."} /> : null}
    <SectionPanel id="customers" title="Vásárlók" description="Minden profil csak ehhez az eladóhoz tartozik." divided={false}>
      {!result.customers.length ? <EmptyState title="Még nincs vásárlási adat" description="Készíts import előnézetet az alábbi űrlappal." /> : null}
      <GdsGrid columns={{ base: 1, md: 2 }}>
        {result.customers.map((customer) => <ListingCard
          key={customer.id}
          title={customer.displayName}
          description={customer.emailNormalized ?? "Nincs e-mail"}
          price={money.format(customer.totalHuf)}
          mediaSeed={customer.id}
          mediaOverlay={privacyLabel[customer.privacyStatus]}
          metadata={[{ id: "external", label: "Külső azonosító", value: customer.externalBuyerId }, { id: "count", label: "Tételek", value: customer.purchaseCount }]}
          primaryAction={<GdsButton component="a" href={`/seller/${sellerSlug}/customers?customer=${customer.id}`} variant="default" leftSection={<GdsIcon name="History" decorative />}>Előzmények</GdsButton>}
        />)}
      </GdsGrid>
    </SectionPanel>
    {selected ? <SectionPanel id="history" title={`${selected.customer.displayName} előzményei`} description="Legfeljebb a 100 legújabb tétel, legújabbal kezdve." action={selected.customer.privacyStatus === "erased" ? <StatusBadge status="neutral">Anonimizált</StatusBadge> : <form action={customerPrivacyAction.bind(null, sellerSlug, selected.customer._id.toString())}><GdsSelect name="status" label="Adatkezelési állapot" defaultValue={selected.customer.privacyStatus} data={[{ value: "active", label: "Aktív" }, { value: "restricted", label: "Korlátozott" }, { value: "erasure_requested", label: "Törlésre jelölve" }]} /><GdsButton type="submit" variant="default" leftSection={<GdsIcon name="Save" decorative />}>Állapot mentése</GdsButton></form>}>
      <GdsGrid columns={{ base: 1, md: 2 }}>
        {selected.purchases.map((purchase) => <ListingCard
          key={purchase.id}
          title={purchase.productName}
          description={`${purchase.quantity} db · ${date.format(new Date(purchase.purchasedAt))}`}
          price={money.format(purchase.totalHuf)}
          mediaSeed={purchase.id}
          mediaOverlay={statusLabel[purchase.status]}
          metadata={[{ id: "order", label: "Rendelés", value: `${purchase.orderId} / ${purchase.lineId}` }, { id: "sku", label: "Cikkszám", value: purchase.productSku }, { id: "version", label: "Verzió", value: `v${purchase.version}` }]}
          revealContent={purchase.status === "purchased" ? <form action={purchaseStatusAction.bind(null, sellerSlug, selected.customer._id.toString(), purchase.id, purchase.version)}><GdsSelect name="status" label="Helyesbítés típusa" defaultValue="refunded" data={[{ value: "refunded", label: "Visszatérítve" }, { value: "corrected", label: "Helyesbítve" }]} /><TextInput name="reason" label="Indok" required maxLength={300} /><GdsButton type="submit" leftSection={<GdsIcon name="Save" decorative />}>Mentés</GdsButton></form> : <BannerNotice variant="compact" severity="info" message={purchase.correctionReason ?? "A tétel már lezárt állapotú."} />}
        />)}
      </GdsGrid>
    </SectionPanel> : null}
    <SectionPanel id="purchase-import" title="Vásárlási JSON-import" description="Legfeljebb 200 sor. Az előnézet ellenőrzi az ismétlődő rendelési tételeket és a mezőket; az ismeretlen cikkszám megmarad pillanatképként.">
      <form action={previewPurchasesAction.bind(null, sellerSlug)}><TextInput name="sourceName" label="Forrás neve" required maxLength={120} placeholder="Webshop export" /><GdsTextarea name="json" label="Vásárlási tételek" minRows={11} required placeholder={'[{"externalBuyerId":"C-1","buyerEmail":"vasarlo@example.com","buyerName":"Minta Vásárló","orderId":"O-1","lineId":"1","productSku":"SKU-1","productName":"Termék","purchasedAt":"2026-09-01T10:00:00Z","quantity":1,"totalHuf":12990}]'} /><GdsButton type="submit" leftSection={<GdsIcon name="Preview" decorative />}>Előnézet készítése</GdsButton></form>
      {batch ? <SectionPanel title="Import előnézet" description={`${batch.sourceName} · ${batch.status}`} action={batch.status === "preview" && !batch.rows.some((row: { action: string }) => row.action === "error") ? <form action={applyPurchasesAction.bind(null, sellerSlug, batch._id.toString())}><GdsButton type="submit" leftSection={<GdsIcon name="Import" decorative />}>Ellenőrzött import alkalmazása</GdsButton></form> : undefined}>
        <div className="table-wrap"><SimpleDataTable rows={batch.rows.map((row: { row: number; key: string; action: string; errorCodes: string[] }) => ({ row: row.row, key: row.key || "—", action: row.action, detail: row.errorCodes.join(", ") || "Rendben" }))} columns={[{ key: "row", header: "Sor" }, { key: "key", header: "Azonosító" }, { key: "action", header: "Eredmény" }, { key: "detail", header: "Részlet" }]} /></div>
      </SectionPanel> : null}
    </SectionPanel>
  </Shell>;
}
