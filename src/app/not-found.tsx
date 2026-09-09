import { Button as GdsButton, GdsErrorPageTemplate } from "@discountdirect/gds-client";
import { Shell } from "@/components/shell";

export default function NotFound() {
  return <Shell><GdsErrorPageTemplate state="not-found" code="404" title="Ez az oldal nem található." description="A keresett oldal nem létezik, vagy másik címre költözött." recovery={<GdsButton component="a" href="/">Vissza az áttekintéshez</GdsButton>} /></Shell>;
}
