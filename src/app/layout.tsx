import type { Metadata } from "next";
import "./globals.css";
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
        <a className="skip-link" href="#main">
          Ugrás a tartalomhoz
        </a>
        {children}
      </body>
    </html>
  );
}
