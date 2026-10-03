import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProofPilot: check a print file before an artist opens it",
  description:
    "Pick a PNG or PDF, enter the ordered size and product, and get a measured PASS or SOFT-FAIL with the numbers behind it.",
  applicationName: "ProofPilot",
  metadataBase: new URL("https://proofcut.vercel.app"),
  openGraph: {
    title: "ProofPilot",
    description: "Measured preflight for one print file: PASS or SOFT-FAIL, with the numbers.",
    url: "https://proofcut.vercel.app",
    type: "website",
  },
  appleWebApp: { capable: true, title: "ProofPilot", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1114" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
