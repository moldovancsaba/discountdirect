import { redirect } from "next/navigation";
import { currentUser, membershipsFor } from "@/auth/service";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";
export default async function SellerPage({
  params,
}: {
  params: Promise<{ sellerSlug: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const { sellerSlug } = await params;
  const membership = (await membershipsFor(user.id)).find(
    (item) => item.slug === sellerSlug && item.sellerStatus === "active",
  );
  if (!membership) redirect("/account?error=forbidden");
  return (
    <Shell active="account">
      <p className="eyebrow">ELADÓI MUNKATÉR</p>
      <h1>{membership.name}</h1>
      <p className="lead">
        A hozzáférést aktív eladói tagság alapján ellenőriztük.
      </p>
      <section className="feature-card">
        <h2>A munkatér előkészítve</h2>
        <p>
          A katalógus, vásárlók, beszélgetések és kampányok a következő
          fejlesztési lépésekben jelennek meg.
        </p>
      </section>
    </Shell>
  );
}
