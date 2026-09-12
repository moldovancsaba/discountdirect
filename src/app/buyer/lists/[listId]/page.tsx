import { redirect } from "next/navigation";
import { Button as GdsButton, GdsGrid, GdsIcon, ListingCard, PageHeader, SectionPanel, StatusBadge } from "@discountdirect/gds-client";
import { currentUser } from "@/auth/service";
import { buyerOfferList } from "@/automations/service";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";
const money = new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Budapest" });
type OfferListProduct = { productId: string; productName: string; reasonText: string; priceHuf: number; reasonCode: string; productSku: string; evidencePurchaseIds: string[] };

export default async function BuyerListPage({ params }: { params: Promise<{ listId: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const { listId } = await params;
  let list;
  try { list = await buyerOfferList(user.id, listId); } catch { redirect("/buyer/lists"); }
  return <Shell active="account">
    <PageHeader title={list.title} description={`Elérhető: ${date.format(new Date(list.availableUntil))}. A termékek nem foglalások és nem kézbesítési igazolások.`} eyebrow="Ajánlatlista" actions={<div className="button-row"><GdsButton component="a" href="/buyer/lists" variant="default" leftSection={<GdsIcon name="Back" decorative />}>Listák</GdsButton><GdsButton component="a" href={`/buyer/letters/${list.id}`} variant="default" leftSection={<GdsIcon name="Print" decorative />}>Nyomtatható levél</GdsButton><StatusBadge status={list.status === "active" ? "success" : "neutral"}>{list.status}</StatusBadge></div>} />
    <SectionPanel title="Ajánlott termékek" description="Minden indoklás a vásárlási előzményekből származó bizonyítékokra hivatkozik.">
      <GdsGrid columns={{ base: 1, md: 2 }}>
        {list.products.map((product: OfferListProduct) => <ListingCard key={product.productId} title={product.productName} description={product.reasonText} price={money.format(product.priceHuf)} mediaSeed={product.productId} mediaOverlay={product.reasonCode} metadata={[{ id: "sku", label: "Cikkszám", value: product.productSku }, { id: "evidence", label: "Bizonyíték", value: `${product.evidencePurchaseIds.length} vásárlási tétel` }]} />)}
      </GdsGrid>
    </SectionPanel>
  </Shell>;
}
