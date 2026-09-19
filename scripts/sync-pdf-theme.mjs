import { writeFile } from "node:fs/promises";
import { getGdsVibeThemeCssVariables } from "@sovereignsquad/gds-theme/server";

const variables = getGdsVibeThemeCssVariables("mint", "light");
const theme = {
  source: "@sovereignsquad/gds-theme@6.7.0 mint/light",
  primary: variables["--gds-vibe-primary"],
  canvas: variables["--gds-bg-canvas"],
  surface: variables["--gds-bg-surface"],
  border: variables["--gds-border-card"],
  text: variables["--gds-text-body"],
  muted: variables["--gds-text-meta"],
};

if (Object.values(theme).some((value) => !value)) throw new Error("GDS PDF theme tokens are incomplete");
await writeFile(new URL("../src/postal/pdf-theme.generated.json", import.meta.url), `${JSON.stringify(theme, null, 2)}\n`);
