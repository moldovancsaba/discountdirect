"use client";

import { GdsProvider, resolveGdsThemePreset } from "@sovereignsquad/gds-theme/client";

const mintCircuitTheme = resolveGdsThemePreset("mint");

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <GdsProvider locale="hu" theme={mintCircuitTheme} defaultColorScheme="light" defaultBadgeIconStyle="tabler">
      {children}
    </GdsProvider>
  );
}
