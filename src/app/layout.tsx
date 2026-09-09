import type { Metadata } from "next";
import "@sovereignsquad/gds-theme/styles.css";
import "./globals.css";
import { Providers } from "./providers";
export const metadata: Metadata = {
  title: { default: "DiscountDirect", template: "%s · DiscountDirect" },
  description: "Személyes ajánlatok, tartós vásárlói kapcsolatok.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="hu">
      <body>
        <Providers>
          <a className="skip-link" href="#main">
            Ugrás a tartalomhoz
          </a>
          {children}
        </Providers>
      </body>
    </html>
  );
}
