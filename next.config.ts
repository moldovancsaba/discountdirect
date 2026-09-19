import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  transpilePackages: [
    "@sovereignsquad/gds-theme",
    "@sovereignsquad/gds-core",
    "@sovereignsquad/gds-admin",
  ],
  outputFileTracingIncludes: {
    "/api/sellers/*/offers/*/print": [
      "./node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf",
      "./node_modules/@expo-google-fonts/noto-sans/700Bold/NotoSans_700Bold.ttf",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
