"use client";

import Link from "next/link";
import { Button as GdsButton, GdsErrorPageTemplate, GdsIcon } from "@sovereignsquad/gds-core/client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main id="main" className="gds-page"><GdsErrorPageTemplate title="Valami nem sikerült." description="Próbáld újra néhány pillanat múlva." recovery={<div className="button-row"><GdsButton onClick={reset} leftSection={<GdsIcon name="Refresh" decorative />}>Újrapróbálás</GdsButton><GdsButton component={Link} href="/" variant="default">Vissza az áttekintéshez</GdsButton></div>} /></main>;
}
