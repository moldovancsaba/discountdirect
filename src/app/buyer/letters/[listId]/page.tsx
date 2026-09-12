import { redirect } from "next/navigation";
import { Button as GdsButton, PageHeader, SectionPanel, SimpleDataTable } from "@discountdirect/gds-client";
import { currentUser } from "@/auth/service";
import { buyerOfferList } from "@/automations/service";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";
const money = new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("hu-HU", { dateStyle: "long", timeZone: "Europe/Budapest" });
type OfferListProduct = { productId: string; productName: string; priceHuf: number; reasonText: string };

export default async function BuyerLetterPage({ params }: { params: Promise<{ listId: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const { listId } = await params;
  let list;
  try { list = await buyerOfferList(user.id, listId); } catch { redirect("/buyer/lists"); }
  return <Shell active="account">
    <PageHeader title="Nyomtatható ajánlatlevél" description="A levél a DiscountDirect-lista nyomtatható nézete. A fizikai postázást ez nem igazolja." eyebrow={date.format(new Date(list.createdAt))} actions={<GdsButton component="a" href={`/buyer/lists/${list.id}`} variant="default">Lista megnyitása</GdsButton>} />
    <SectionPanel title="Levél" description="Nyomtatáskor csak az alábbi levéltartalom marad látható.">
      <article className="print-letter">
        <p>Tisztelt Vásárlónk!</p>
        <p>Az Ön korábbi vásárlásai alapján az alábbi termékeket ajánljuk figyelmébe. Az ajánlatlista {date.format(new Date(list.availableUntil))} napjáig érhető el.</p>
        <SimpleDataTable rows={list.products.map((product: OfferListProduct) => ({ name: product.productName, price: money.format(product.priceHuf), reason: product.reasonText }))} columns={[{ key: "name", header: "Termék" }, { key: "price", header: "Ár" }, { key: "reason", header: "Indoklás" }]} />
        <p>Ez a levél ajánlati tájékoztató, nem fizetési vagy kézbesítési igazolás.</p>
      </article>
    </SectionPanel>
  </Shell>;
}
