import { redirect } from "next/navigation";
import { Button as GdsButton, EmptyState, PageHeader, SectionPanel, SimpleDataTable, StatusBadge } from "@discountdirect/gds-client";
import { currentUser } from "@/auth/service";
import { Shell } from "@/components/shell";
import { listSellerDeliveries } from "@/delivery/service";

export const dynamic = "force-dynamic";
const date = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Budapest" });
const statusTone: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = { queued: "info", processing: "info", sent: "success", unsupported: "warning", suppressed: "neutral", retryable_failed: "danger", cancelled: "neutral" };

export default async function DeliveriesPage({ params }: { params: Promise<{ sellerSlug: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const { sellerSlug } = await params;
  let data;
  try { data = await listSellerDeliveries(user.id, sellerSlug); } catch { redirect("/account?error=forbidden"); }
  return <Shell active="account">
    <PageHeader title="Kézbesítési napló" description="Tartós csatornaállapotok. A TRANSPORT_NOT_CONFIGURED állapot azt jelzi, hogy nincs jóváhagyott külső szolgáltató." eyebrow={data.seller.name} actions={<GdsButton component="a" href={`/seller/${sellerSlug}/automations`} variant="default">Automatizmusok</GdsButton>} />
    <SectionPanel title="Legutóbbi kézbesítési rekordok" description="A napló nem kézbesítési ígéret; minden sor a pillanatnyi, visszakereshető csatornaállapotot mutatja.">
      {!data.deliveries.length ? <EmptyState title="Még nincs kézbesítési rekord" description="Ajánlat, kampány vagy automatizmus létrehozásakor jelenik meg." /> : <div className="table-wrap"><SimpleDataTable rows={data.deliveries.map((item) => ({ createdAt: date.format(new Date(item.createdAt)), kind: item.kind, channel: item.channel, status: <StatusBadge status={statusTone[item.status] ?? "neutral"}>{item.status}</StatusBadge>, reason: item.reasonCode, attempts: item.attemptCount }))} columns={[{ key: "createdAt", header: "Létrejött" }, { key: "kind", header: "Típus" }, { key: "channel", header: "Csatorna" }, { key: "status", header: "Állapot" }, { key: "reason", header: "Ok" }, { key: "attempts", header: "Próbák" }]} /></div>}
    </SectionPanel>
  </Shell>;
}
