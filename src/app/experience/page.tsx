import type { Metadata } from "next";
import { PageHeader, StatusBadge } from "@discountdirect/gds-client";
import { OriginalExperienceWorkspace } from "@/components/original-experience-workspace";
import { Shell } from "@/components/shell";

export const metadata: Metadata = {
  title: "Eredeti DiscountDirect élmény",
  description: "Az eredeti wireframe seller, buyer, villámajánlat és ajánlatlista folyamatai egy interaktív munkatérben.",
};

export default function ExperiencePage() {
  return (
    <Shell active="experience">
      <PageHeader
        title="DiscountDirect eredeti élmény"
        description="Egy mintaadatokkal feltöltött munkatér, ahol a beszélgetés, a vásárlási előzmény, az ajánlás és a csatorna-előnézet egyben látszik."
        eyebrow="Wireframe parity"
        actions={<StatusBadge status="success" withIcon>Interaktív minta</StatusBadge>}
      />
      <OriginalExperienceWorkspace />
    </Shell>
  );
}
