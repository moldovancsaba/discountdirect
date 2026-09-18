import { redirect } from "next/navigation";
import { BannerNotice, Button as GdsButton, Checkbox, GdsIcon, NumberInput, PageHeader, SectionPanel, Select as GdsSelect, StatusBadge, TextInput } from "@discountdirect/gds-client";
import { currentUser } from "@/auth/service";
import { Shell } from "@/components/shell";
import { getSellerSettings } from "@/settings/service";
import { saveSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SellerSettingsPage({ params, searchParams }: { params: Promise<{ sellerSlug: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const { sellerSlug } = await params;
  let result;
  try { result = await getSellerSettings(user.id, sellerSlug); } catch { redirect("/account?error=forbidden"); }
  const query = await searchParams;
  const owner = result.membership.role === "owner";
  const settings = result.settings;
  return <Shell active="account">
    <PageHeader title="Eladói beállítások" description="Piaci, árazási, csatorna- és mérési szabályok. A hiányzó értékeket a rendszer biztonságos magyar alapértékekkel tölti ki." eyebrow={result.seller.name} actions={<div className="button-row"><GdsButton component="a" href={`/seller/${sellerSlug}`} variant="default" leftSection={<GdsIcon name="Back" decorative />}>Vissza a munkatérhez</GdsButton><StatusBadge status="success">HU · HUF · hu-HU</StatusBadge></div>} />
    {query.saved ? <BannerNotice variant="compact" severity="success" message="A beállítások mentve." /> : null}
    {query.error ? <BannerNotice variant="compact" severity="error" message={query.error === "STALE" ? "A beállítások megváltoztak. Frissítsd az oldalt." : query.error === "FORBIDDEN" ? "Csak az eladó tulajdonosa módosíthatja ezeket a beállításokat." : "Ellenőrizd a megadott értékeket."} /> : null}
    {!owner ? <BannerNotice severity="info" title="Csak olvasható" message="A beállításokat csak az eladó tulajdonosa módosíthatja." /> : null}
    <form className="catalog-form" action={saveSettingsAction.bind(null, sellerSlug, result.version)}>
      <SectionPanel title="Működési mód" description="A vásárlói postaláda, adatkezelési hatókör és nyomtatás alapmódja." divided>
        <GdsSelect name="inboxMode" label="Postaláda mód" defaultValue={settings.inbox_mode} disabled={!owner} data={[{ value: "per_seller", label: "Eladónként külön" }, { value: "marketplace", label: "Közös piactéri postaláda" }]} />
        <GdsSelect name="consentScope" label="Hozzájárulás hatóköre" defaultValue={settings.consent_scope} disabled={!owner} data={[{ value: "per_seller", label: "Eladónként" }, { value: "inbox", label: "Teljes postaláda" }]} />
        <GdsSelect name="printMode" label="Nyomtatási mód" defaultValue={settings.print_mode} disabled={!owner} data={[{ value: "seller", label: "Eladói nyomtatás" }, { value: "platform_service", label: "Platformszolgáltatás" }]} />
      </SectionPanel>
      <SectionPanel title="Kedvezmény szabályok" description="A rendszer csak a megadott, egész százalékos tartományban hozhat létre ajánlatot." divided>
        <GdsSelect name="discountMode" label="Kedvezmény mód" defaultValue={settings.discount_mode} disabled={!owner} data={[{ value: "steps", label: "Előre megadott lépések" }, { value: "guardrails", label: "Szabályozott tartomány" }]} />
        <TextInput name="discountSteps" label="Kedvezménylépések (%)" defaultValue={settings.discount_steps.join(", ")} disabled={!owner} required />
        <NumberInput name="discountFloor" label="Minimum kedvezmény (%)" defaultValue={settings.discount_guardrails.floor_pct} disabled={!owner} min={0} max={100} step={1} allowDecimal={false} required />
        <NumberInput name="discountMaximum" label="Maximum kedvezmény (%)" defaultValue={settings.discount_guardrails.max_pct} disabled={!owner} min={0} max={100} step={1} allowDecimal={false} required />
        <NumberInput name="marginFloor" label="Minimum árrés (%)" defaultValue={settings.discount_guardrails.margin_floor_pct} disabled={!owner} min={0} max={100} step={1} allowDecimal={false} required />
        <Checkbox name="reasonEditable" value="yes" defaultChecked={settings.reason_editable} disabled={!owner} label="Az ajánlat indoklása küldés előtt szerkeszthető" />
      </SectionPanel>
      <SectionPanel title="Kapcsolattartási limitek" description="A csatornánkénti felső korlátok később a küldési engedélyezés bemenetei." divided>
        <NumberInput name="emailCap" label="E-mail / 30 nap" defaultValue={settings.frequency_cap.email_per_30d} disabled={!owner} min={0} max={100} step={1} allowDecimal={false} required />
        <NumberInput name="chatCap" label="Chat / 7 nap" defaultValue={settings.frequency_cap.chat_per_7d} disabled={!owner} min={0} max={100} step={1} allowDecimal={false} required />
        <NumberInput name="mailingCap" label="Postai levél / 90 nap" defaultValue={settings.frequency_cap.mailing_per_90d} disabled={!owner} min={0} max={100} step={1} allowDecimal={false} required />
        <NumberInput name="rcsCap" label="RCS / 7 nap" defaultValue={settings.frequency_cap.rcs_per_7d} disabled={!owner} min={0} max={100} step={1} allowDecimal={false} required />
        <NumberInput name="holdoutPct" label="Kontrollcsoport (%)" defaultValue={settings.holdout_pct} disabled={!owner} min={0} max={20} step={1} allowDecimal={false} required />
      </SectionPanel>
      {owner ? <GdsButton type="submit" leftSection={<GdsIcon name="Save" decorative />}>Beállítások mentése</GdsButton> : null}
    </form>
  </Shell>;
}
