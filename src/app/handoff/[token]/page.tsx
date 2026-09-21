import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Button as GdsButton, StateBlock } from "@discountdirect/gds-client";
import { Shell } from "@/components/shell";
import { HandoffError, consumeOfferHandoff } from "@/handoff/service";

export const metadata: Metadata = { title: "Webáruházi átadás", robots: { index: false, follow: false } };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const states = {
  INVALID: ["Érvénytelen átadási hivatkozás", "Nyisd meg újra az elfogadott ajánlatot az ajánlataid között."],
  EXPIRED: ["Az átadási hivatkozás lejárt", "Az elfogadott ajánlatból kérhetsz új, rövid ideig érvényes hivatkozást."],
  USED: ["Ezt a hivatkozást már felhasználták", "Minden webáruházi átadási hivatkozás egyszer használható."],
  FORBIDDEN: ["Az átadás már nem engedélyezett", "Az eladóval fennálló aktív kapcsolat szükséges a folytatáshoz."],
  CONFLICT: ["Az ajánlat már nem adható át", "Az ajánlat állapota vagy érvényessége közben megváltozott."],
  UNAVAILABLE: ["A webáruházi átadás átmenetileg nem érhető el", "Az elfogadásod megmaradt. Próbáld újra később az ajánlataidból."],
  NOT_FOUND: ["Az átadás nem található", "Nyisd meg újra az elfogadott ajánlatot az ajánlataid között."],
} as const;

export default async function HandoffPage({ params }: { params: Promise<{ token: string }> }) {
  try { redirect(await consumeOfferHandoff((await params).token)); }
  catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    const code = error instanceof HandoffError ? error.code : "UNAVAILABLE";
    const [title, description] = states[code];
    return <Shell active="buyer"><StateBlock variant={code === "FORBIDDEN" ? "permission" : "error"} title={title} description={description} action={<GdsButton component="a" href="/buyer/offers">Vissza az ajánlataimhoz</GdsButton>} minHeight="50vh" /></Shell>;
  }
}
