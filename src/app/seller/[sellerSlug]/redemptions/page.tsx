import { redirect } from "next/navigation";
import { BannerNotice, Button as GdsButton, EmptyState, PageHeader, SectionPanel, SimpleDataTable, StatusBadge, TextInput } from "@discountdirect/gds-client";
import { currentUser } from "@/auth/service";
import { Shell } from "@/components/shell";
import { sellerCoupons } from "@/redemptions/service";
import { confirmRedemptionAction } from "./actions";

export const dynamic = "force-dynamic";
const date = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Budapest" });

export default async function SellerRedemptionsPage({ params, searchParams }: { params: Promise<{ sellerSlug: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const { sellerSlug } = await params;
  let data;
  try { data = await sellerCoupons(user.id, sellerSlug); } catch { redirect("/account?error=forbidden"); }
  const query = await searchParams;
  return <Shell active="account">
    <PageHeader title="Kuponbeváltás" description="Egyszer használható kódok elfogadott ajánlatokhoz. A beváltás nem fizetési igazolás." eyebrow={data.seller.name} actions={<GdsButton component="a" href={`/seller/${sellerSlug}`} variant="default">Eladói munkatér</GdsButton>} />
    {query.saved ? <BannerNotice variant="compact" severity="success" message="A kupon beváltása rögzítve." /> : null}
    {query.error ? <BannerNotice variant="compact" severity="error" message="A kupon nem váltható be. Ellenőrizd a kódot és az állapotot." /> : null}
    <SectionPanel title="Kód ellenőrzése" description="A kódot a vevő elfogadott ajánlat után látja. Ugyanaz a kód csak egyszer használható.">
      <form action={confirmRedemptionAction.bind(null, sellerSlug)}>
        <TextInput name="code" label="Kuponkód" required pattern="DD-[A-F0-9]{10}" placeholder="DD-1234ABCD99" />
        <GdsButton type="submit">Beváltás rögzítése</GdsButton>
      </form>
    </SectionPanel>
    <SectionPanel title="Legutóbbi kuponok" description="A lejárt és már beváltott kódok is látszanak az audit miatt.">
      {!data.coupons.length ? <EmptyState title="Még nincs kupon" description="Elfogadott ajánlat után jön létre." /> : <SimpleDataTable rows={data.coupons.map((coupon) => ({ code: coupon.code, status: <StatusBadge status={coupon.status === "redeemed" ? "success" : coupon.status === "issued" ? "info" : "neutral"}>{coupon.status}</StatusBadge>, issued: date.format(new Date(coupon.issuedAt)), expires: date.format(new Date(coupon.expiresAt)), redeemed: coupon.redeemedAt ? date.format(new Date(coupon.redeemedAt)) : "—" }))} columns={[{ key: "code", header: "Kód" }, { key: "status", header: "Állapot" }, { key: "issued", header: "Kiadva" }, { key: "expires", header: "Lejár" }, { key: "redeemed", header: "Beváltva" }]} />}
    </SectionPanel>
  </Shell>;
}
