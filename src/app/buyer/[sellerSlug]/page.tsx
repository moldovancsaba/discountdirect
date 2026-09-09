import { redirect } from "next/navigation";
import { buyerRelationshipsFor, currentUser } from "@/auth/service";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";
export default async function BuyerPage({
  params,
}: {
  params: Promise<{ sellerSlug: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const { sellerSlug } = await params;
  const relationship = (await buyerRelationshipsFor(user.id)).find(
    (item) => item.slug === sellerSlug && item.sellerStatus === "active",
  );
  if (!relationship) redirect("/account?error=forbidden");
  return (
    <Shell active="account">
      <p className="eyebrow">VÁSÁRLÓI KAPCSOLAT</p>
      <h1>{relationship.name}</h1>
      <p className="lead">
        Csak a saját, aktív vásárlói kapcsolatod adatai jelenhetnek meg ezen az
        oldalon.
      </p>
      <section className="feature-card">
        <h2>A személyes felület előkészítve</h2>
        <p>
          Az ajánlatok és beszélgetések a kapcsolódó fejlesztési feladatokkal
          érkeznek.
        </p>
      </section>
    </Shell>
  );
}
