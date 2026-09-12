import { redirect } from "next/navigation";
import { EmptyState, GdsGrid, ListingCard, PageHeader, SectionPanel, StatusBadge } from "@discountdirect/gds-client";
import { currentUser } from "@/auth/service";
import { Shell } from "@/components/shell";
import { buyerCoupons } from "@/redemptions/service";

export const dynamic = "force-dynamic";
const money = new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Budapest" });

export default async function BuyerRedemptionsPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const { coupons } = await buyerCoupons(user.id);
  return <Shell active="account">
    <PageHeader title="Kuponjaim" description="Elfogadott ajánlatokhoz tartozó egyszer használható kódok. A kód beváltása külön eladói megerősítést igényel." eyebrow="Vásárlói felület" actions={<StatusBadge status="info">{coupons.length} kupon</StatusBadge>} />
    <SectionPanel title="Elérhető és korábbi kuponok" description="A lejárt vagy beváltott kupon megmarad az előzmények között.">
      {!coupons.length ? <EmptyState title="Még nincs kupon" description="Kupon akkor jön létre, ha elfogadsz egy ajánlatot." /> : <GdsGrid columns={{ base: 1, md: 2 }}>
        {coupons.map((coupon) => <ListingCard key={coupon.id} title={coupon.offer?.productName ?? "Ajánlat"} description={`Kód: ${coupon.code}`} price={coupon.offer ? money.format(coupon.offer.priceHuf) : undefined} mediaSeed={coupon.id} mediaOverlay={coupon.status} metadata={[{ id: "expires", label: "Lejár", value: date.format(new Date(coupon.expiresAt)) }, { id: "redeemed", label: "Beváltva", value: coupon.redeemedAt ? date.format(new Date(coupon.redeemedAt)) : "Még nem" }]} />)}
      </GdsGrid>}
    </SectionPanel>
  </Shell>;
}
