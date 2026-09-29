import { BANNED_RE, composeMessage } from "./draft";
import type { PreflightResult } from "./preflight";

export { BANNED_RE };

export type WordingConfidence = "high" | "medium" | "low";

export const WORDING_PROMPTS = ["explain", "rebuild"] as const;

export type WordingPrompt = (typeof WORDING_PROMPTS)[number];

export const EXPLAIN_PROMPT =
  "Explain the preflight verdict in one named line per fail, using only code-measured numbers. Keep it concise with no apology.";

export const REBUILD_PROMPT =
  "Suggest how to rebuild the file so it passes, one step per fail, using only code-measured numbers. Keep it concise with no apology.";

export interface Explanation {
  prompt: "explain";
  headline: string;
  body: string[];
  confidence: WordingConfidence;
  needsApprove: true;
}

export interface RebuildSuggestion {
  prompt: "rebuild";
  steps: string[];
  confidence: WordingConfidence;
  needsApprove: true;
}

export function lintTone(text: string): boolean {
  return !BANNED_RE.test(text);
}

export function assertCleanTone(text: string): void {
  if (!lintTone(text)) throw new Error("banned word in wording");
}

export function wordingConfidence(r: PreflightResult): WordingConfidence {
  if (r.pass) return "high";
  return r.fails.length >= 2 ? "low" : "medium";
}

export function explainFix(r: PreflightResult): Explanation {
  const confidence = wordingConfidence(r);
  if (r.pass) {
    const line = composeMessage(r);
    assertCleanTone(line);
    return { prompt: "explain", headline: line, body: [line], confidence, needsApprove: true };
  }
  const headline = `Needs artist review: ${r.fails.join(", ")}.`;
  const body = composeMessage(r).split("\n").filter((l) => l.length > 0);
  assertCleanTone(headline);
  for (const line of body) assertCleanTone(line);
  return { prompt: "explain", headline, body, confidence, needsApprove: true };
}

function rebuildStep(r: PreflightResult, code: string): string {
  const m = r.measurements;
  switch (code) {
    case "low-ppi":
      return `Rebuild art at 300 PPI at ordered size (now ${Math.round(m.ppi)} PPI, ${m.pixelWidth}x${m.pixelHeight}px).`;
    case "bleed":
      return `Extend art to 0.125in past the cut line (now ${m.bleedWidthIn.toFixed(3)}in).`;
    case "cutline":
      return `Add a CutContour spot path for ${r.productId}.`;
    case "white-ink":
      return `Add a white underbase layer under color areas for ${r.productId}.`;
    case "tiny-text":
      return `Enlarge text to 6pt or more (smallest now ${m.minTextPt}pt).`;
    case "dims-mismatch":
      return `Resize art to ordered size (now ${m.pixelWidth}x${m.pixelHeight}px).`;
    default:
      return `Fix ${code} for ${r.productId}.`;
  }
}

export function suggestRebuild(r: PreflightResult): RebuildSuggestion {
  const confidence = wordingConfidence(r);
  const steps =
    r.pass || r.fails.length === 0
      ? [
          `No rebuild needed: ${Math.round(r.measurements.ppi)} PPI, bleed ${r.measurements.bleedWidthIn.toFixed(3)}in, cut line present. Ready to draft.`,
        ]
      : r.fails.map((f) => rebuildStep(r, f));
  for (const step of steps) assertCleanTone(step);
  return { prompt: "rebuild", steps, confidence, needsApprove: true };
}
