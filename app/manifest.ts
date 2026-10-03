import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ProofPilot",
    short_name: "ProofPilot",
    description: "Measured preflight for one print file: PASS or SOFT-FAIL, with the numbers.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f6f8",
    theme_color: "#1d4ed8",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
