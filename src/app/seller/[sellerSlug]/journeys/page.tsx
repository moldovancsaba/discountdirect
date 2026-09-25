import { redirect } from "next/navigation";
import {
  BannerNotice,
  Button as GdsButton,
  EmptyState,
  GdsGrid,
  GdsIcon,
  ListingCard,
  NumberInput,
  PageHeader,
  SectionPanel,
  Select as GdsSelect,
  StatusBadge,
  TextInput,
} from "@discountdirect/gds-client";
import { currentUser } from "@/auth/service";
import { Shell } from "@/components/shell";
import { listJourneys } from "@/journeys/service";
import { listCustomers } from "@/purchases/service";
import { listProducts } from "@/catalog/service";
import { enableJourneyAction, journeyStatusAction } from "./actions";
export const dynamic = "force-dynamic";
export default async function JourneysPage({
  params,
  searchParams,
}: {
  params: Promise<{ sellerSlug: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const { sellerSlug } = await params;
  let data;
  let customers;
  let products;
  try {
    [data, customers, products] = await Promise.all([
      listJourneys(user.id, sellerSlug),
      listCustomers(user.id, sellerSlug),
      listProducts(user.id, sellerSlug, false),
    ]);
  } catch {
    redirect("/account?error=forbidden");
  }
  const query = await searchParams;
  const eligible = customers.customers.filter(
    (customer) =>
      customer.emailNormalized && customer.privacyStatus === "active",
  );
  return (
    <Shell active="account">
      <PageHeader
        title="Ügyfélutak"
        description="Idő- vagy eseményindítású, több lépéses kapcsolattartás. Minden lépés végrehajtás előtt újra ellenőrzi a jogosultságot és a hozzájárulást."
        eyebrow={data.seller.name}
        actions={
          <StatusBadge status="info">
            {data.journeys.length} ügyfélút
          </StatusBadge>
        }
      />
      {query.saved ? (
        <BannerNotice
          variant="compact"
          severity="success"
          message={
            query.saved === "created"
              ? "Az ügyfélút aktív és a lépések tartósan ütemezve vannak."
              : "Az ügyfélút állapota frissült."
          }
        />
      ) : null}
      {query.error ? (
        <BannerNotice
          variant="compact"
          severity="error"
          message="Az ügyfélút nem menthető. Ellenőrizd a vásárlót, a lépéseket és az aktuális verziót."
        />
      ) : null}
      <SectionPanel
        title="Új ügyfélút"
        description="Legfeljebb két, egymás után számított lépés. A mentés befagyasztja a szabály- és tartalomverziót."
      >
        {eligible.length ? (
          <form
            className="catalog-form"
            action={enableJourneyAction.bind(null, sellerSlug)}
          >
            <TextInput
              name="name"
              label="Ügyfélút neve"
              required
              maxLength={160}
            />
            <GdsSelect
              name="customerId"
              label="Vásárló"
              required
              data={eligible.map((customer) => ({
                value: customer.id,
                label: `${customer.displayName} · ${customer.emailNormalized}`,
              }))}
            />
            <GdsSelect
              name="triggerKind"
              label="Indítás"
              defaultValue="manual"
              data={[
                { value: "manual", label: "Kézi indítás" },
                {
                  value: "purchase_age_days",
                  label: "Vásárlás óta eltelt nap",
                },
              ]}
            />
            <GdsSelect
              name="productId"
              label="Figyelt termék (készlet- vagy árváltozáshoz)"
              data={[
                { value: "", label: "Nincs termékhez kötve" },
                ...products.products.map((product) => ({
                  value: product.id,
                  label: `${product.name} · ${product.sku}`,
                })),
              ]}
            />
            <NumberInput
              name="ageDays"
              label="Vásárlás kora (nap)"
              defaultValue={0}
              min={0}
              max={3660}
              step={1}
              allowDecimal={false}
              required
            />
            <TextInput
              name="firstTitle"
              label="Első lépés címe"
              required
              maxLength={160}
            />
            <GdsSelect
              name="firstChannel"
              label="Első lépés csatornája"
              defaultValue="in_app"
              data={[
                { value: "in_app", label: "Alkalmazáson belül" },
                { value: "email", label: "E-mail" },
                { value: "postal", label: "Postai" },
              ]}
            />
            <NumberInput
              name="firstDelay"
              label="Első késleltetés (perc)"
              defaultValue={0}
              min={0}
              max={525600}
              step={1}
              allowDecimal={false}
              required
            />
            <TextInput
              name="followUpTitle"
              label="Második lépés címe (nem kötelező)"
              maxLength={160}
            />
            <GdsSelect
              name="followUpChannel"
              label="Második lépés csatornája"
              defaultValue="email"
              data={[
                { value: "in_app", label: "Alkalmazáson belül" },
                { value: "email", label: "E-mail" },
                { value: "postal", label: "Postai" },
              ]}
            />
            <NumberInput
              name="followUpDelay"
              label="Második késleltetés (perc)"
              defaultValue={1440}
              min={0}
              max={525600}
              step={1}
              allowDecimal={false}
            />
            <GdsButton
              type="submit"
              leftSection={<GdsIcon name="Calendar" decorative />}
            >
              Ellenőrzés és aktiválás
            </GdsButton>
          </form>
        ) : (
          <EmptyState
            title="Nincs alkalmas vásárló"
            description="Aktív, azonosított vásárlói kapcsolat szükséges az ügyfélút indításához."
          />
        )}
      </SectionPanel>
      <SectionPanel
        title="Definíciók"
        description="A szüneteltetés leállítja az új igényléseket; a már igényelt lépés legfeljebb két perc után újraértékelhető."
      >
        {!data.journeys.length ? (
          <EmptyState
            title="Még nincs ügyfélút"
            description="Hozd létre az első verziózott ügyfélutat."
          />
        ) : (
          <GdsGrid columns={{ base: 1, md: 2 }}>
            {data.journeys.map((journey) => (
              <ListingCard
                key={journey.id}
                title={journey.name}
                description={`Definíció v${journey.activeVersion} · ${journey.counts.active ?? 0} aktív · ${journey.counts.completed ?? 0} lezárt`}
                mediaSeed={journey.id}
                mediaOverlay={
                  journey.status === "active" ? "Aktív" : "Szünetel"
                }
                primaryAction={
                  <form
                    action={journeyStatusAction.bind(
                      null,
                      sellerSlug,
                      journey.id,
                      journey.version,
                      journey.status === "active" ? "paused" : "active",
                    )}
                  >
                    <GdsButton
                      type="submit"
                      variant="default"
                      leftSection={
                        <GdsIcon
                          name={journey.status === "active" ? "Pause" : "Play"}
                          decorative
                        />
                      }
                    >
                      {journey.status === "active"
                        ? "Szüneteltetés"
                        : "Újraindítás"}
                    </GdsButton>
                  </form>
                }
              />
            ))}
          </GdsGrid>
        )}
      </SectionPanel>
    </Shell>
  );
}
