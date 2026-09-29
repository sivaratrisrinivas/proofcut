import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ProofPilot",
  description: "Preflight every upload in under 30 seconds and draft the proof.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#f6f6f8" }}>
        <main style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>{children}</main>
      </body>
    </html>
  );
}
