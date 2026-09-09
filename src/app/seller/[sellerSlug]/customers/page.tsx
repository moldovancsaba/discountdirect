import Link from "next/link";
import { redirect } from "next/navigation";
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
const privacyLabel: Record<string, string> = { active: "Aktív", restricted: "Korlátozott", erasure_requested: "Törlésre jelölve" };

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
    <div className="section-heading"><div><p className="eyebrow">VÁSÁRLÓI FŐKÖNYV</p><h1>{result.seller.name}</h1></div><Link className="button button-secondary" href={`/seller/${sellerSlug}`}>Termékkatalógus</Link></div>
    <p className="lead">Eladóhoz kötött vásárlók és időrendi rendelési tételek. A visszatérített és helyesbített tételek nem számítanak bele a költésbe.</p>
    {query.saved && messages[query.saved] ? <div className="notice positive" role="status">{messages[query.saved]}</div> : null}
    {query.error ? <div className="notice negative" role="alert">{errors[query.error] ?? "A művelet nem hajtható végre."}</div> : null}
    <section className="catalog-section" aria-labelledby="customers"><div className="section-heading"><h2 id="customers">Vásárlók</h2><span className="pill">{result.customers.length} kapcsolat</span></div>
      {!result.customers.length ? <div className="empty-state"><h3>Még nincs vásárlási adat</h3><p>Készíts import előnézetet az alábbi űrlappal.</p></div> : null}
      <div className="product-list">{result.customers.map((customer) => <article className="product-row" key={customer.id}><div><span className="step-number">{customer.externalBuyerId}</span><h3>{customer.displayName}</h3><p>{customer.emailNormalized ?? "Nincs e-mail"} · {customer.purchaseCount} tétel · {money.format(customer.totalHuf)}</p><small>{privacyLabel[customer.privacyStatus]}</small></div><Link className="button button-secondary" href={`/seller/${sellerSlug}/customers?customer=${customer.id}`}>Előzmények</Link></article>)}</div>
    </section>
    {selected ? <section className="catalog-section" aria-labelledby="history"><div className="section-heading"><div><h2 id="history">{selected.customer.displayName} előzményei</h2><p className="muted">Legfeljebb a 100 legújabb tétel, legújabbal kezdve.</p></div><form action={customerPrivacyAction.bind(null, sellerSlug, selected.customer._id.toString())}><label>Adatkezelési állapot<select name="status" defaultValue={selected.customer.privacyStatus}><option value="active">Aktív</option><option value="restricted">Korlátozott</option><option value="erasure_requested">Törlésre jelölve</option></select></label><button className="button button-secondary" type="submit">Állapot mentése</button></form></div>
      <div className="product-list">{selected.purchases.map((purchase) => <article className={`product-row ${purchase.status === "purchased" ? "" : "is-archived"}`} key={purchase.id}><div><span className="step-number">{purchase.orderId} / {purchase.lineId}</span><h3>{purchase.productName}</h3><p>{purchase.quantity} db · {money.format(purchase.totalHuf)} · {date.format(new Date(purchase.purchasedAt))}</p><small>{statusLabel[purchase.status]} · {purchase.productSku} · v{purchase.version}{purchase.correctionReason ? ` · ${purchase.correctionReason}` : ""}</small></div>{purchase.status === "purchased" ? <details><summary className="button button-secondary">Helyesbítés</summary><form className="catalog-form compact" action={purchaseStatusAction.bind(null, sellerSlug, selected.customer._id.toString(), purchase.id)}><input type="hidden" name="version" value={purchase.version} /><label>Állapot<select name="status"><option value="refunded">Visszatérítve</option><option value="corrected">Helyesbítve</option></select></label><label>Indok<input name="reason" required maxLength={300} /></label><button className="button" type="submit">Mentés</button></form></details> : null}</article>)}</div>
    </section> : null}
    <section className="catalog-section" aria-labelledby="purchase-import"><h2 id="purchase-import">Vásárlási JSON-import</h2><p className="lead">Legfeljebb 200 sor. Az előnézet ellenőrzi az ismétlődő rendelési tételeket és a mezőket; az ismeretlen cikkszám megmarad pillanatképként.</p>
      <form action={previewPurchasesAction.bind(null, sellerSlug)}><label>Forrás neve<input name="sourceName" required maxLength={120} placeholder="Webshop export" /></label><label htmlFor="purchase-json">Vásárlási tételek</label><textarea id="purchase-json" name="json" rows={11} required placeholder={'[{"externalBuyerId":"C-1","buyerEmail":"vasarlo@example.com","buyerName":"Minta Vásárló","orderId":"O-1","lineId":"1","productSku":"SKU-1","productName":"Termék","purchasedAt":"2026-09-01T10:00:00Z","quantity":1,"totalHuf":12990}]'} /><button className="button" type="submit">Előnézet készítése</button></form>
      {batch ? <div className="import-preview"><div className="section-heading"><div><h3>Import előnézet</h3><p className="muted">{batch.sourceName} · {batch.status}</p></div>{batch.status === "preview" && !batch.rows.some((row: { action: string }) => row.action === "error") ? <form action={applyPurchasesAction.bind(null, sellerSlug)}><input type="hidden" name="batchId" value={batch._id.toString()} /><button className="button" type="submit">Ellenőrzött import alkalmazása</button></form> : null}</div><div className="table-wrap"><table><thead><tr><th>Sor</th><th>Azonosító</th><th>Eredmény</th><th>Részlet</th></tr></thead><tbody>{batch.rows.map((row: { row: number; key: string; action: string; errorCodes: string[] }) => <tr key={row.row}><td>{row.row}</td><td>{row.key || "—"}</td><td>{row.action}</td><td>{row.errorCodes.join(", ") || "Rendben"}</td></tr>)}</tbody></table></div></div> : null}
    </section>
  </Shell>;
}
