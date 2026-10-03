import type { NextConfig } from "next";

const corpusFiles = ["./corpus/**/*", "./corpus-l2-content/*.png", "./corpus-l2-content/*.pdf", "./corpus-l2-content/*.json"];

const nextConfig: NextConfig = {
  // The API routes read sample files from disk; make sure they ship with the functions.
  outputFileTracingIncludes: {
    "/api/preflight": corpusFiles,
    "/api/demo-image": corpusFiles,
  },
  poweredByHeader: false,
};

export default nextConfig;
