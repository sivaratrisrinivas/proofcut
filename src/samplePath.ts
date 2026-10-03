import { join } from "node:path";
import type { SampleEntry } from "./catalog";

/**
 * Absolute path of a whitelisted sample. The corpus folders ship with the
 * functions through outputFileTracingIncludes in next.config.ts, so the
 * bundler is told not to trace this dynamic path.
 */
export function samplePath(sample: SampleEntry): string {
  return join(/* turbopackIgnore: true */ process.cwd(), sample.dir, sample.file);
}
