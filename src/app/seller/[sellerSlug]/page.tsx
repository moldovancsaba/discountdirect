import { redirect } from "next/navigation";
import { BannerNotice, Button as GdsButton, Checkbox, EmptyState, GdsGrid, GdsIcon, ListingCard, NumberInput, PageHeader, SectionPanel, SimpleDataTable, StatusBadge, Textarea as GdsTextarea, TextInput } from "@discountdirect/gds-client";
import { currentUser } from "@/auth/service";
import { getImportBatch, listProducts } from "@/catalog/service";
import { Shell } from "@/components/shell";
import { applyImportAction, archiveProductAction, createProductAction, previewImportAction, saveProductAction } from "./actions";

export const dynamic = "force-dynamic";
const money = new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
const messages: Record<string, string> = { created: "A termék létrejött.", updated: "A termék módosításai mentve.", archived: "A termék archiválva.", imported: "Az import sikeresen alkalmazva." };
const errors: Record<string, string> = { INVALID: "Ellenőrizd a megadott adatokat.", CONFLICT: "Ez a cikkszám már létezik.", STALE: "Az adat időközben megváltozott. Frissítsd az oldalt.", TOO_LARGE: "Az import 1–100 sort tartalmazhat." };

export default async function SellerPage({ params, searchParams }: { params: Promise<{ sellerSlug: string }>; searchParams: Promise<{ saved?: string; error?: string; batch?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const { sellerSlug } = await params;
  let catalog;
  try { catalog = await listProducts(user.id, sellerSlug, true); } catch { redirect("/account?error=forbidden"); }
  const query = await searchParams;
  let batch: Awaited<ReturnType<typeof getImportBatch>> | null = null;
  if (query.batch) { try { batch = await getImportBatch(user.id, sellerSlug, query.batch); } catch { batch = null; } }
  const active = catalog.products.filter((product) => product.active);
  const archived = catalog.products.filter((product) => !product.active);
  return <Shell active="account">
    <PageHeader title={catalog.seller.name} description="A katalógus minden művelete ehhez az eladóhoz kötött. Az árak egész forintban, a készletek darabban szerepelnek." eyebrow="Eladói munkatér" actions={<div className="button-row"><GdsButton component="a" href={`/seller/${sellerSlug}/customers`} variant="default" leftSection={<GdsIcon name="Users" decorative />}>Vásárlói főkönyv</GdsButton><GdsButton component="a" href={`/seller/${sellerSlug}/campaigns`} variant="default" leftSection={<GdsIcon name="Send" decorative />}>Villámkampányok</GdsButton><StatusBadge status="success" withIcon>{active.length} aktív termék</StatusBadge></div>} />
    {query.saved && messages[query.saved] ? <BannerNotice variant="compact" severity="success" message={messages[query.saved]} /> : null}
    {query.error ? <BannerNotice variant="compact" severity="error" message={errors[query.error] ?? "A művelet nem hajtható végre."} /> : null}
    <SectionPanel id="new-product" title="Új termék" description="A katalógushoz tartozó alapadatok." divided>
      <form className="catalog-form" action={createProductAction.bind(null, sellerSlug)}>
        <TextInput name="sku" label="Cikkszám" required maxLength={64} pattern="[A-Za-z0-9._-]+" />
        <TextInput name="name" label="Név" required maxLength={160} />
        <NumberInput name="priceHuf" label="Ár (Ft)" required min={0} max={1_000_000_000} step={1} allowDecimal={false} />
        <NumberInput name="stock" label="Készlet (db)" required min={0} max={1_000_000} step={1} allowDecimal={false} />
        <TextInput name="category" label="Kategória" required maxLength={80} />
        <TextInput name="compatibleWith" label="Kompatibilitás, vesszővel elválasztva" maxLength={500} />
        <GdsButton type="submit" leftSection={<GdsIcon name="Add" decorative />}>Termék hozzáadása</GdsButton>
      </form>
    </SectionPanel>
    <SectionPanel id="products" title="Termékek" description="Optimista verzióellenőrzéssel; a kártya megfordításával szerkeszthető." divided={false}>
      {!catalog.products.length ? <EmptyState title="Még nincs termék" description="Adj hozzá egy terméket, vagy készíts JSON-import előnézetet." /> : null}
      <GdsGrid columns={{ base: 1, md: 2 }}>
        {catalog.products.map((product) => <ListingCard
          key={product.id}
          title={product.name}
          description={`${product.stock} db · ${product.category}`}
          price={money.format(product.priceHuf)}
          mediaSeed={product.id}
          mediaOverlay={product.active ? "Aktív" : "Archivált"}
          metadata={[{ id: "sku", label: "Cikkszám", value: product.sku }, { id: "version", label: "Verzió", value: `v${product.version}` }]}
          revealContent={<form action={saveProductAction.bind(null, sellerSlug, product.id, product.version, product.active)}>
            <TextInput name="sku" label="Cikkszám" defaultValue={product.sku} required />
            <TextInput name="name" label="Név" defaultValue={product.name} required />
            <NumberInput name="priceHuf" label="Ár (Ft)" defaultValue={product.priceHuf} min={0} step={1} required allowDecimal={false} />
            <NumberInput name="stock" label="Készlet" defaultValue={product.stock} min={0} step={1} required allowDecimal={false} />
            <TextInput name="category" label="Kategória" defaultValue={product.category} required />
            <TextInput name="compatibleWith" label="Kompatibilitás" defaultValue={product.compatibleWith.join(", ")} />
            <GdsButton type="submit" leftSection={<GdsIcon name="Save" decorative />}>Mentés</GdsButton>
            {product.active ? <><Checkbox name="confirm" value="yes" label="Megerősítem a termék archiválását." /><GdsButton color="red" type="submit" formAction={archiveProductAction.bind(null, sellerSlug, product.id, product.version)} leftSection={<GdsIcon name="Archive" decorative />}>Archiválás</GdsButton></> : null}
          </form>}
        />)}
      </GdsGrid>
      {archived.length ? <BannerNotice variant="compact" severity="info" message={`${archived.length} archivált termék megmarad az előzményekhez, de új ajánlatokban nem használható.`} /> : null}
    </SectionPanel>
    <SectionPanel id="import" title="JSON-import" description="Legfeljebb 100 sor. Az előnézet soronként jelzi a létrehozást, módosítást, változatlanságot vagy hibát.">
      <form action={previewImportAction.bind(null, sellerSlug)}><GdsTextarea name="json" label="Terméklista" minRows={10} required placeholder={'[{"sku":"SKU-1","name":"Termék","priceHuf":12990,"stock":5,"category":"Kategória","compatibleWith":[],"active":true}]'} /><GdsButton type="submit" leftSection={<GdsIcon name="Preview" decorative />}>Előnézet készítése</GdsButton></form>
      {batch ? <SectionPanel title="Import előnézet" description={`Állapot: ${batch.status}`} action={batch.status === "preview" && !batch.rows.some((row: { action: string }) => row.action === "error") ? <form action={applyImportAction.bind(null, sellerSlug, batch._id.toString())}><GdsButton type="submit" leftSection={<GdsIcon name="Import" decorative />}>Ellenőrzött import alkalmazása</GdsButton></form> : undefined}>
        <div className="table-wrap"><SimpleDataTable rows={batch.rows.map((row: { row: number; sku: string; action: string; errorCodes: string[]; expectedVersion: number }) => ({ row: row.row, sku: row.sku || "—", action: row.action, detail: row.errorCodes.join(", ") || `v${row.expectedVersion}` }))} columns={[{ key: "row", header: "Sor" }, { key: "sku", header: "SKU" }, { key: "action", header: "Eredmény" }, { key: "detail", header: "Részlet" }]} /></div>
      </SectionPanel> : null}
    </SectionPanel>
  </Shell>;
}
