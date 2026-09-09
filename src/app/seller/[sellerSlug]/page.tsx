import Link from "next/link";
import { redirect } from "next/navigation";
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
  return (
    <Shell active="account">
      <div className="section-heading"><div><p className="eyebrow">ELADÓI MUNKATÉR</p><h1>{catalog.seller.name}</h1></div><div className="button-row"><Link className="button button-secondary" href={`/seller/${sellerSlug}/customers`}>Vásárlói főkönyv</Link><span className="pill">{active.length} aktív termék</span></div></div>
      <p className="lead">A katalógus minden művelete ehhez az eladóhoz kötött. Az árak egész forintban, a készletek darabban szerepelnek.</p>
      {query.saved && messages[query.saved] ? <div className="notice positive" role="status">{messages[query.saved]}</div> : null}
      {query.error ? <div className="notice negative" role="alert">{errors[query.error] ?? "A művelet nem hajtható végre."}</div> : null}
      <section className="catalog-section" aria-labelledby="new-product"><h2 id="new-product">Új termék</h2>
        <form className="catalog-form" action={createProductAction.bind(null, sellerSlug)}>
          <label>Cikkszám<input name="sku" required maxLength={64} pattern="[A-Za-z0-9._-]+" /></label><label>Név<input name="name" required maxLength={160} /></label><label>Ár (Ft)<input name="priceHuf" type="number" required min="0" max="1000000000" step="1" /></label><label>Készlet (db)<input name="stock" type="number" required min="0" max="1000000" step="1" /></label><label>Kategória<input name="category" required maxLength={80} /></label><label className="wide">Kompatibilitás, vesszővel elválasztva<input name="compatibleWith" maxLength={500} /></label><button className="button" type="submit">Termék hozzáadása</button>
        </form>
      </section>
      <section className="catalog-section" aria-labelledby="products"><div className="section-heading"><h2 id="products">Termékek</h2><span className="muted">Optimista verzióellenőrzéssel</span></div>
        {!catalog.products.length ? <div className="empty-state"><h3>Még nincs termék</h3><p>Adj hozzá egy terméket, vagy készíts JSON-import előnézetet.</p></div> : null}
        <div className="product-list">{catalog.products.map((product) => (
          <article className={`product-row ${product.active ? "" : "is-archived"}`} key={product.id}><div><span className="step-number">{product.sku}</span><h3>{product.name}</h3><p>{money.format(product.priceHuf)} · {product.stock} db · {product.category}</p><small>{product.active ? "Aktív" : "Archivált"} · v{product.version}</small></div>
            <details><summary className="button button-secondary">Szerkesztés</summary><form className="catalog-form compact" action={saveProductAction.bind(null, sellerSlug, product.id)}><input type="hidden" name="version" value={product.version} /><input type="hidden" name="active" value={String(product.active)} /><label>Cikkszám<input name="sku" defaultValue={product.sku} required /></label><label>Név<input name="name" defaultValue={product.name} required /></label><label>Ár (Ft)<input name="priceHuf" type="number" defaultValue={product.priceHuf} min="0" step="1" required /></label><label>Készlet<input name="stock" type="number" defaultValue={product.stock} min="0" step="1" required /></label><label>Kategória<input name="category" defaultValue={product.category} required /></label><label className="wide">Kompatibilitás<input name="compatibleWith" defaultValue={product.compatibleWith.join(", ")} /></label><button className="button" type="submit">Mentés</button>{product.active ? <><label className="confirm-check wide"><input type="checkbox" name="confirm" value="yes" /> Megerősítem a termék archiválását.</label><button className="button button-danger" type="submit" formAction={archiveProductAction.bind(null, sellerSlug, product.id)}>Archiválás</button></> : null}</form></details>
          </article>))}</div>
        {archived.length ? <p className="muted">{archived.length} archivált termék megmarad az előzményekhez, de új ajánlatokban nem használható.</p> : null}
      </section>
      <section className="catalog-section" aria-labelledby="import"><h2 id="import">JSON-import</h2><p className="lead">Legfeljebb 100 sor. Az előnézet nem ír adatot; soronként jelzi a létrehozást, módosítást, változatlanságot vagy hibát.</p>
        <form action={previewImportAction.bind(null, sellerSlug)}><label htmlFor="import-json">Terméklista</label><textarea id="import-json" name="json" rows={10} required placeholder={'[{"sku":"SKU-1","name":"Termék","priceHuf":12990,"stock":5,"category":"Kategória","compatibleWith":[],"active":true}]'} /><button className="button" type="submit">Előnézet készítése</button></form>
        {batch ? <div className="import-preview"><div className="section-heading"><div><h3>Import előnézet</h3><p className="muted">Állapot: {batch.status}</p></div>{batch.status === "preview" && !batch.rows.some((row: { action: string }) => row.action === "error") ? <form action={applyImportAction.bind(null, sellerSlug)}><input type="hidden" name="batchId" value={batch._id.toString()} /><button className="button" type="submit">Ellenőrzött import alkalmazása</button></form> : null}</div><div className="table-wrap"><table><thead><tr><th>Sor</th><th>SKU</th><th>Eredmény</th><th>Részlet</th></tr></thead><tbody>{batch.rows.map((row: { row: number; sku: string; action: string; errorCodes: string[]; expectedVersion: number }) => <tr key={row.row}><td>{row.row}</td><td>{row.sku || "—"}</td><td>{row.action}</td><td>{row.errorCodes.join(", ") || `v${row.expectedVersion}`}</td></tr>)}</tbody></table></div></div> : null}
      </section>
    </Shell>
  );
}
