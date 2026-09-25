import { redirect } from "next/navigation";
import { BannerNotice, Button as GdsButton, EmptyState, GdsGrid, GdsIcon, ListingCard, PageHeader, SectionPanel, StatusBadge } from "@discountdirect/gds-client";
import { currentUser } from "@/auth/service";
import { BuyerRelationship } from "@/auth/models";
import { Seller } from "@/auth/models";
import { listProductWatches } from "@/journeys/watch-service";
import { Shell } from "@/components/shell";
import { cancelWatchAction } from "./actions";

const triggerLabel: Record<string, string> = { back_in_stock: "Készletre érkezés", price_drop: "Árcsökkenés" };

export default async function BuyerWatchesPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const relationship = await BuyerRelationship.findOne({ buyerUserId: user.id, status: "active" }).sort({ updatedAt: -1 }).lean();
  if (!relationship) return <Shell active="buyer"><PageHeader title="Termékfigyelések" description="Bejelentkezett vásárlói profilhoz kapcsolódó figyelések." eyebrow="Vásárlói felület" /><EmptyState title="Nincs aktív vásárlói kapcsolat" description="A termékfigyelés csak olyan eladónál használható, ahol a vásárlói kapcsolat aktív." /></Shell>;
  const seller = await Seller.findById(relationship.sellerId).lean();
  if (!seller) redirect("/buyer");
  const data = await listProductWatches(user.id, seller.slug);
  const query = await searchParams;
  return <Shell active="buyer">
    <PageHeader title="Termékfigyelések" description="Értesítést kaphatsz, ha egy figyelt termék újra elérhető vagy olcsóbb lesz." eyebrow={seller.name} actions={<StatusBadge status="info">{data.watches.length} figyelés</StatusBadge>} />
    {query.saved ? <BannerNotice severity="success" variant="compact" message="A termékfigyelés megszüntetve." /> : null}
    {query.error ? <BannerNotice severity="error" variant="compact" message="A termékfigyelés állapota közben megváltozott. Frissítsd az oldalt." /> : null}
    <SectionPanel title="Figyelt termékek" description="A figyelés bármikor megszüntethető. Az értesítés csak aktív adatvédelmi státusz mellett indul.">
      {!data.watches.length ? <EmptyState title="Még nincs termékfigyelés" description="A termékfigyelés a termékoldali vásárlói műveletből hozható létre." /> : <GdsGrid columns={{ base: 1, md: 2 }}>{data.watches.map((watch) => <ListingCard key={watch.id} title={watch.product?.name ?? "Archivált termék"} description={`${watch.product?.sku ?? ""} · ${triggerLabel[watch.triggerKind] ?? watch.triggerKind}`} price={watch.product?.priceHuf ? `${watch.product.priceHuf.toLocaleString("hu-HU")} Ft` : undefined} mediaSeed={watch.productId} mediaOverlay={watch.status === "active" ? "Aktív" : "Szüneteltetve"} metadata={[{ id: "trigger", label: "Feltétel", value: triggerLabel[watch.triggerKind] ?? watch.triggerKind }, { id: "last", label: "Utolsó jelzés", value: watch.lastTriggeredAt ? new Intl.DateTimeFormat("hu-HU").format(new Date(watch.lastTriggeredAt)) : "Még nem történt" }]} primaryAction={watch.status !== "cancelled" ? <form action={cancelWatchAction.bind(null, seller.slug, watch.id, watch.version)}><GdsButton type="submit" variant="default" leftSection={<GdsIcon name="Close" decorative />}>Figyelés megszüntetése</GdsButton></form> : undefined} />)}</GdsGrid>}
    </SectionPanel>
  </Shell>;
}
