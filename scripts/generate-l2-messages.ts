import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { preflightFile } from "../src/preflightFile";
import { getSpec } from "../src/specs";
import { assertCleanTone } from "../src/wording";

// L2 message layer: 15-20 synthetic customer notes for a future wording judge.
// Each note pairs a real L2 SOFT-FAIL row with its code-measured numbers
// (ppi rounded, bleed to 3dp, pixel dims, text pt — the same formatting the
// explain/rebuild copy uses). Tone lint enforced at generate time.
// Explicitly out of scope: judge prompt, scoring harness.

const OUT_DIR = join(import.meta.dir, "..", "corpus-l2-content");

type Tone = "first-time" | "revision" | "angry-wismo";

interface Ctx {
  display: string;
  ordered: string;
  ppi: number;
  bleed: string;
  dims: string;
  minTextPt: number | null;
}

interface ManifestRow {
  file: string;
  productId: string;
  orderedWidthIn: number;
  orderedHeightIn: number;
  expectedVerdict: "PASS" | "SOFT-FAIL";
}

const selections: { file: string; tone: Tone; write: (c: Ctx) => string }[] = [
  {
    file: "l2-005.png", tone: "first-time",
    write: (c) => `Hi, first sticker order here — ${c.ordered} ${c.display}. Your report shows ${c.dims} at ${c.ppi} PPI, but bleed is only ${c.bleed}in past the cut line and you need 0.125in. What should I change in my file?`,
  },
  {
    file: "l2-017.png", tone: "first-time",
    write: (c) => `Hello! I uploaded art for ${c.ordered} ${c.display} and see ${c.dims} at ${c.ppi} PPI with ${c.bleed}in bleed. I understand you need 300 PPI — how do I rebuild this correctly?`,
  },
  {
    file: "l2-015.png", tone: "first-time",
    write: (c) => `First time ordering ${c.ordered} ${c.display}. My file is ${c.dims} at ${c.ppi} PPI with ${c.bleed}in bleed, but the report says the CutContour path is missing. Where does that path go?`,
  },
  {
    file: "l2-012.png", tone: "first-time",
    write: (c) => `Hi — my ${c.ordered} ${c.display} file is ${c.dims} at ${c.ppi} PPI with ${c.bleed}in bleed, but the smallest text is ${c.minTextPt}pt and the minimum is 6pt. If I enlarge it, does everything else pass?`,
  },
  {
    file: "l2-026.png", tone: "first-time",
    write: (c) => `First order of ${c.ordered} ${c.display}, ${c.dims} at ${c.ppi} PPI with ${c.bleed}in bleed. The report flags a missing white underbase layer. My art looks right otherwise — how do I add it?`,
  },
  {
    file: "cut-002.pdf", tone: "first-time",
    write: (c) => `Hello, I sent a PDF for ${c.ordered} ${c.display} and your check says the cut line is missing. The file itself reads ${c.dims} at ${c.ppi} PPI with ${c.bleed}in bleed — what exactly is absent?`,
  },
  {
    file: "l2-006.png", tone: "revision",
    write: (c) => `Back with a revision of my ${c.ordered} die-cut file — now ${c.dims} at ${c.ppi} PPI with ${c.bleed}in bleed. I know both numbers still miss 300 PPI and 0.125in. Which fix matters most?`,
  },
  {
    file: "l2-020.png", tone: "revision",
    write: (c) => `Revised my ${c.ordered} ${c.display}: ${c.dims} at ${c.ppi} PPI, bleed ${c.bleed}in versus 0.125in needed. The 8pt text passes at least — do I just extend the art edges?`,
  },
  {
    file: "l2-024.png", tone: "revision",
    write: (c) => `New revision uploaded for ${c.ordered} die-cut, ${c.dims} at ${c.ppi} PPI. Bleed reads ${c.bleed}in and there is a large black block in the art. Is the black block also a problem, or only the bleed?`,
  },
  {
    file: "l2-030.png", tone: "revision",
    write: (c) => `Revision 2 of my ${c.ordered} clear stickers, ${c.dims} at ${c.ppi} PPI with ${c.bleed}in bleed. Still flagged: no white underbase, and smallest text ${c.minTextPt}pt under 6pt. I will fix both — confirming that covers it?`,
  },
  {
    file: "white-002.pdf", tone: "revision",
    write: (c) => `Updated the PDF for ${c.ordered} ${c.display}, ${c.dims} at ${c.ppi} PPI with ${c.bleed}in bleed. Still seeing white-ink and ${c.minTextPt}pt tiny-text flags. My designer asks: white underbase plus bigger type, anything else?`,
  },
  {
    file: "cut-005.pdf", tone: "revision",
    write: (c) => `Resent the ${c.ordered} die-cut PDF after downsampling by mistake — now reading ${c.ppi} PPI at ${c.dims} with ${c.bleed}in bleed. What resolution should I resend?`,
  },
  {
    file: "l2-032.png", tone: "angry-wismo",
    write: (c) => `Where is my order? My ${c.ordered} packaging tape file is ${c.dims} at ${c.ppi} PPI and you hold it for ${c.bleed}in bleed versus 0.125in. Tell me the one fix that unblocks it.`,
  },
  {
    file: "l2-021.png", tone: "angry-wismo",
    write: (c) => `I paid for ${c.ordered} ${c.display} and your site says ${c.dims} at ${c.ppi} PPI with ${c.bleed}in bleed. My event is Friday — tell me exactly what file to resend so this ships.`,
  },
  {
    file: "l2-028.png", tone: "angry-wismo",
    write: (c) => `This is the third upload for my ${c.ordered} holographic stickers — ${c.dims} at ${c.ppi} PPI, bleed ${c.bleed}in, yet still flagged for no white ink. Explain in plain words what is missing.`,
  },
  {
    file: "l2-018.png", tone: "angry-wismo",
    write: (c) => `My ${c.ordered} die-cut order is stuck: ${c.dims} at ${c.ppi} PPI with ${c.bleed}in bleed when you demand 300 PPI. I need this resolved today — what resolution do you actually measure?`,
  },
  {
    file: "white-005.pdf", tone: "angry-wismo",
    write: (c) => `Order status please — ${c.ordered} clear sticker PDF reading ${c.ppi} PPI at ${c.dims} with ${c.bleed}in bleed, plus no white ink layer. Give me the measured numbers and the exact rebuild steps.`,
  },
  {
    file: "cut-004.pdf", tone: "angry-wismo",
    write: (c) => `Why is my ${c.ordered} clear sticker PDF on hold? It reads ${c.dims} at ${c.ppi} PPI with ${c.bleed}in bleed and has the cut line, but your report wants white ink. Confirm what passes and what fails.`,
  },
];

async function main(): Promise<void> {
  const manifest = (await Bun.file(join(OUT_DIR, "manifest.json")).json()) as ManifestRow[];
  const byFile = new Map(manifest.map((m) => [m.file, m]));
  const lines: string[] = [];

  for (const s of selections) {
    const row = byFile.get(s.file);
    if (!row) throw new Error(`messages: manifest has no ${s.file}`);
    if (row.expectedVerdict !== "SOFT-FAIL") throw new Error(`messages: ${s.file} is not a SOFT-FAIL`);
    const r = await preflightFile(
      join(OUT_DIR, s.file),
      { widthIn: row.orderedWidthIn, heightIn: row.orderedHeightIn },
      row.productId,
    );
    if (r.verdict !== "SOFT-FAIL") throw new Error(`messages: ${s.file} measures PASS`);
    const ctx: Ctx = {
      display: getSpec(row.productId).displayName,
      ordered: `${row.orderedWidthIn}x${row.orderedHeightIn}`,
      ppi: Math.round(r.measurements.ppi),
      bleed: r.measurements.bleedWidthIn.toFixed(3),
      dims: `${r.measurements.pixelWidth}x${r.measurements.pixelHeight}px`,
      minTextPt: r.measurements.minTextPt,
    };
    const text = s.write(ctx);
    assertCleanTone(text);
    lines.push(JSON.stringify({
      jobId: s.file.replace(/\.[^.]+$/, ""),
      file: s.file,
      productId: row.productId,
      tone: s.tone,
      fails: r.fails,
      measured: {
        ppi: ctx.ppi,
        bleedWidthIn: Number(ctx.bleed),
        pixelWidth: r.measurements.pixelWidth,
        pixelHeight: r.measurements.pixelHeight,
        minTextPt: ctx.minTextPt,
      },
      text,
    }));
  }

  await writeFile(join(OUT_DIR, "messages.jsonl"), lines.join("\n") + "\n");
  const tones = [...new Set(selections.map((s) => s.tone))].sort().join(",");
  console.log(`wrote ${lines.length} messages to corpus-l2-content/messages.jsonl (tones: ${tones})`);
}

await main();
