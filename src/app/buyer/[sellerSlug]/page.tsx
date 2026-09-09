import { redirect } from "next/navigation";
import { currentUser } from "@/auth/service";
import { Shell } from "@/components/shell";
import { buyerHistory } from "@/purchases/service";

export const dynamic = "force-dynamic";
export default async function BuyerPage({
  params,
}: {
  params: Promise<{ sellerSlug: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const { sellerSlug } = await params;
  let history;
  try { history = await buyerHistory(user.id, sellerSlug); } catch { redirect("/account?error=forbidden"); }
  const money = new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
  const date = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeZone: "Europe/Budapest" });
  return (
    <Shell active="account">
      <p className="eyebrow">VÁSÁRLÓI KAPCSOLAT</p>
      <h1>{history.seller.name}</h1>
      <p className="lead">
        Csak a saját, aktív vásárlói kapcsolatod adatai jelenhetnek meg ezen az
        oldalon.
      </p>
      <section className="catalog-section"><div className="section-heading"><h2>Saját vásárlási előzményeim</h2><span className="pill">{history.purchases.length} tétel</span></div>
        {!history.customer ? <div className="empty-state"><h3>Még nincs összekapcsolt vásárlás</h3><p>Az eladó által importált, e-mail-címedhez kapcsolt tételek itt jelennek meg.</p></div> : null}
        <div className="product-list">{history.purchases.map((purchase) => <article className={`product-row ${purchase.status === "purchased" ? "" : "is-archived"}`} key={purchase.id}><div><span className="step-number">{purchase.orderId} / {purchase.lineId}</span><h3>{purchase.productName}</h3><p>{purchase.quantity} db · {money.format(purchase.totalHuf)} · {date.format(new Date(purchase.purchasedAt))}</p><small>{purchase.status === "purchased" ? "Vásárlás" : purchase.status === "refunded" ? "Visszatérítve" : "Helyesbítve"}</small></div></article>)}</div>
      </section>
    </Shell>
  );
}
