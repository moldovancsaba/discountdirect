import { redirect } from "next/navigation";
import { Button as GdsButton, EmptyState, GdsGrid, GdsIcon, ListingCard, PageHeader, SectionPanel, StatusBadge } from "@discountdirect/gds-client";
import { currentUser } from "@/auth/service";
import { Shell } from "@/components/shell";
import { buyerHistory } from "@/purchases/service";

export const dynamic = "force-dynamic";
export default async function BuyerPage({ params }: { params: Promise<{ sellerSlug: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const { sellerSlug } = await params;
  let history;
  try { history = await buyerHistory(user.id, sellerSlug); } catch { redirect("/account?error=forbidden"); }
  const money = new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
  const date = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeZone: "Europe/Budapest" });
  return <Shell active="account">
    <PageHeader title={history.seller.name} description="Csak a saját, aktív vásárlói kapcsolatod adatai jelenhetnek meg ezen az oldalon." eyebrow="Vásárlói kapcsolat" actions={<div className="button-row"><GdsButton component="a" href={`/buyer/${sellerSlug}/preferences`} variant="default" leftSection={<GdsIcon name="Settings" decorative />}>Adatkezelési beállítások</GdsButton><StatusBadge status="success" withIcon>{history.purchases.length} tétel</StatusBadge></div>} />
    <SectionPanel title="Saját vásárlási előzményeim" description="A legújabb vásárlásokkal kezdve." divided={false}>
      {!history.customer ? <EmptyState title="Még nincs összekapcsolt vásárlás" description="Az eladó által importált, e-mail-címedhez kapcsolt tételek itt jelennek meg." /> : null}
      <GdsGrid columns={{ base: 1, md: 2 }}>
        {history.purchases.map((purchase) => <ListingCard
          key={purchase.id}
          title={purchase.productName}
          description={`${purchase.quantity} db · ${date.format(new Date(purchase.purchasedAt))}`}
          price={money.format(purchase.totalHuf)}
          mediaSeed={`${purchase.orderId}-${purchase.lineId}`}
          mediaOverlay={purchase.status === "purchased" ? "Vásárlás" : purchase.status === "refunded" ? "Visszatérítve" : "Helyesbítve"}
          metadata={[{ id: "order", label: "Rendelés", value: `${purchase.orderId} / ${purchase.lineId}` }, { id: "sku", label: "Cikkszám", value: purchase.productSku }]}
        />)}
      </GdsGrid>
    </SectionPanel>
  </Shell>;
}
