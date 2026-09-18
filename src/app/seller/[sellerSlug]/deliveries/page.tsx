import { redirect } from "next/navigation";
import { EmptyState, PageHeader, SectionPanel, SimpleDataTable, StatusBadge } from "@discountdirect/gds-client";
import { currentUser } from "@/auth/service";
import { Shell } from "@/components/shell";
import { listSellerDeliveries } from "@/delivery/service";
import { businessLabel } from "@/presentation/labels";

export const dynamic = "force-dynamic";
const date = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Budapest" });
const statusTone: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = { queued: "info", processing: "info", sent: "success", unsupported: "warning", suppressed: "neutral", retryable_failed: "danger", cancelled: "neutral", bounced: "danger", complained: "danger" };
const channelLabel: Record<string, string> = { in_app: "Alkalmazáson belül", email: "E-mail", postal: "Postai" };

export default async function DeliveriesPage({ params }: { params: Promise<{ sellerSlug: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const { sellerSlug } = await params;
  let data;
  try { data = await listSellerDeliveries(user.id, sellerSlug); } catch { redirect("/account?error=forbidden"); }
  return <Shell active="account">
    <PageHeader title="Kézbesítési napló" description="Minden üzenetnél követhető, melyik csatornán indult el, célba ért-e, vagy miért nem küldhető." eyebrow={data.seller.name} />
    <SectionPanel title="Legutóbbi kézbesítési rekordok" description="A napló nem kézbesítési ígéret; minden sor a pillanatnyi, visszakereshető csatornaállapotot mutatja.">
      {!data.deliveries.length ? <EmptyState title="Még nincs kézbesítési rekord" description="Ajánlat, kampány vagy automatizmus létrehozásakor jelenik meg." /> : <div className="table-wrap"><SimpleDataTable rows={data.deliveries.map((item) => ({ createdAt: date.format(new Date(item.createdAt)), kind: businessLabel(item.kind), channel: channelLabel[item.channel] ?? businessLabel(item.channel), status: <StatusBadge status={statusTone[item.status] ?? "neutral"}>{businessLabel(item.status)}</StatusBadge>, reason: businessLabel(item.reasonCode), attempts: item.attemptCount }))} columns={[{ key: "createdAt", header: "Létrejött" }, { key: "kind", header: "Típus" }, { key: "channel", header: "Csatorna" }, { key: "status", header: "Állapot" }, { key: "reason", header: "Részletek" }, { key: "attempts", header: "Próbák" }]} /></div>}
    </SectionPanel>
  </Shell>;
}
