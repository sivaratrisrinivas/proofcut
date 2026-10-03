"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { PreflightResult, ProductSpec } from "../src/preflight";
import type { PanelRow, UploadPanel } from "../src/upload";
import { composeMessage } from "../src/draft";
import { MAX_UPLOAD_BYTES } from "../src/limits";

interface Sample {
  file: string;
  set: "art" | "geometry";
  kind: "png" | "pdf";
  productId: string;
  productName: string;
  orderedWidthIn: number;
  orderedHeightIn: number;
  note: string;
}

interface GroundTruth {
  expectedVerdict: "PASS" | "SOFT-FAIL";
  expectedFails: string[];
  sameOrder: boolean;
  matches: boolean;
}

type Panel = UploadPanel & { groundTruth?: GroundTruth };
type Mode = "sample" | "upload";
type Decision = "sent" | "fix-note" | null;

const FAIL_NAMES: Record<string, string> = {
  "low-ppi": "low resolution",
  bleed: "bleed too thin",
  cutline: "no cut line",
  "white-ink": "no white ink",
  "tiny-text": "text under 6pt",
  "dims-mismatch": "shape differs from order",
};

const SOURCE_LABEL: Record<PanelRow["source"], string> = {
  measured: "Measured",
  sidecar: "Sidecar",
  spec: "Not needed",
  unavailable: "Not checked",
};

function failList(fails: string[]): string {
  return fails.map((f) => FAIL_NAMES[f] ?? f).join(", ");
}

function formatBytes(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`;
}

function sampleLabel(s: Sample): string {
  return `${s.file.replace(/\.(png|pdf)$/, "")} · ${s.productName} · ${s.orderedWidthIn}x${s.orderedHeightIn}in${s.kind === "pdf" ? " · PDF" : ""}`;
}

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#1d4ed8" />
      <rect x="14" y="14" width="36" height="36" rx="6" fill="none" stroke="#fff" strokeWidth="4" strokeDasharray="6 5" />
      <path d="M24 33l6 6 12-14" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function VerdictIcon({ kind }: { kind: "pass" | "fail" | "review" }) {
  return (
    <span className="badge" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {kind === "pass" ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : kind === "fail" ? <path d="M12 7v6M12 17h.01" /> : <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.4M12 17h.01" />}
      </svg>
    </span>
  );
}

function CheckRow({ row }: { row: PanelRow }) {
  const state = row.source === "unavailable" ? "unknown" : row.ok === false ? "bad" : "ok";
  const stateText = state === "unknown" ? "Not checked" : state === "bad" ? "Fails" : "Passes";
  return (
    <li className="check">
      <span className={`icon ${state}`} role="img" aria-label={stateText}>
        {state === "unknown" ? "?" : state === "bad" ? "✕" : "✓"}
      </span>
      <div className="check-body">
        <div className="check-head">
          <span className="check-label">{row.label}</span>
          <span className="chip">{SOURCE_LABEL[row.source]}</span>
        </div>
        <span className="check-detail">{row.display}</span>
      </div>
    </li>
  );
}

function Preview({
  src,
  result,
  ordered,
  bleedRequiredIn,
}: {
  src: string;
  result: PreflightResult;
  ordered: { widthIn: number; heightIn: number };
  bleedRequiredIn: number;
}) {
  const insetX = Math.min(20, (bleedRequiredIn / ordered.widthIn) * 100);
  const insetY = Math.min(20, (bleedRequiredIn / ordered.heightIn) * 100);
  const cut = result.measurements.cutlinePresent;
  return (
    <figure className="figure">
      <div className="frame">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`Preview of the checked file with the ${cut ? "cut line and " : ""}bleed zone drawn on top`} />
        <div
          className={`overlay${cut ? " cut" : ""}`}
          style={{
            left: `${insetX}%`,
            right: `${insetX}%`,
            top: `${insetY}%`,
            bottom: `${insetY}%`,
            boxShadow: "0 0 0 9999px var(--bleed)",
          }}
        />
      </div>
      <ul className="legend">
        {cut ? (
          <li>
            <span className="swatch cut" aria-hidden="true" /> Cut line
          </li>
        ) : null}
        <li>
          <span className="swatch bleed" aria-hidden="true" /> {bleedRequiredIn}in bleed zone
        </li>
      </ul>
    </figure>
  );
}

export default function ReviewLoop() {
  const [products, setProducts] = useState<ProductSpec[]>([]);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [loadError, setLoadError] = useState("");
  const [mode, setMode] = useState<Mode>("sample");
  const [file, setFile] = useState<File | null>(null);
  const [demoFile, setDemoFile] = useState("");
  const [widthIn, setWidthIn] = useState("3");
  const [heightIn, setHeightIn] = useState("3");
  const [productId, setProductId] = useState("die-cut");
  const [panel, setPanel] = useState<Panel | null>(null);
  const [ran, setRan] = useState<{ widthIn: number; heightIn: number; productId: string; name: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [decision, setDecision] = useState<Decision>(null);
  const [copied, setCopied] = useState(false);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const ids = { sample: useId(), file: useId(), width: useId(), height: useId(), product: useId(), err: useId() };

  const applySample = useCallback((s: Sample | undefined) => {
    if (!s) return;
    setDemoFile(s.file);
    setWidthIn(String(s.orderedWidthIn));
    setHeightIn(String(s.orderedHeightIn));
    setProductId(s.productId);
  }, []);

  useEffect(() => {
    fetch("/api/preflight")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d: { products?: ProductSpec[]; samples?: Sample[] }) => {
        setProducts(d.products ?? []);
        setSamples(d.samples ?? []);
        applySample(d.samples?.[0]);
      })
      .catch(() => setLoadError("Sample files did not load. Refresh to try again, or upload your own file."));
  }, [applySample]);

  useEffect(() => {
    return () => {
      if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const selectedSample = useMemo(() => samples.find((s) => s.file === demoFile), [samples, demoFile]);
  const artSamples = useMemo(() => samples.filter((s) => s.set === "art"), [samples]);
  const geometrySamples = useMemo(() => samples.filter((s) => s.set === "geometry"), [samples]);
  const ranSpec = useMemo(() => products.find((p) => p.id === ran?.productId), [products, ran]);

  const message = useMemo(() => {
    if (!panel) return "";
    if (!panel.result) {
      return panel.rows
        .filter((r) => r.ok === false)
        .map((r) => `${r.label}: ${r.display}.`)
        .join("\n");
    }
    try {
      return composeMessage(panel.result);
    } catch {
      return "";
    }
  }, [panel]);

  const widthNum = Number(widthIn);
  const heightNum = Number(heightIn);
  const widthBad = widthIn !== "" && !(widthNum > 0);
  const heightBad = heightIn !== "" && !(heightNum > 0);

  function pickFile(f: File | null) {
    setUploadError("");
    if (f && !/\.(png|pdf)$/i.test(f.name)) {
      setUploadError("Only PNG and PDF files are supported.");
      setFile(null);
      return;
    }
    if (f && f.size > MAX_UPLOAD_BYTES) {
      setUploadError(`That file is ${formatBytes(f.size)}. Files over 4.5 MB do not fit the host limit. Export a smaller PNG.`);
      setFile(null);
      return;
    }
    setFile(f);
  }

  function escalateHref(): string {
    const r = panel?.result;
    const name = ran?.name ?? "file";
    const subject = encodeURIComponent(`ProofPilot escalation: ${name} (${ran?.productId ?? productId})`);
    const lines = [
      `ProofPilot proof needs support review.`,
      `File: ${name}`,
      `Product: ${ran?.productId ?? productId}, ordered ${ran?.widthIn ?? widthIn}x${ran?.heightIn ?? heightIn}in`,
    ];
    if (r) {
      const m = r.measurements;
      lines.push(
        `Verdict: ${r.verdict}`,
        `Fails: ${r.fails.join(", ") || "none"}`,
        `Measurements: ${Math.round(m.ppi)} PPI, bleed ${m.bleedWidthIn.toFixed(3)}in, ${m.pixelWidth}x${m.pixelHeight}px.`,
      );
    } else if (panel) {
      lines.push(...panel.rows.map((row) => `${row.label}: ${row.display}`));
    }
    return `mailto:support@proofpilot.example?subject=${subject}&body=${encodeURIComponent(lines.join("\n"))}`;
  }

  async function runPreflight(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setUploadError("");
    setDecision(null);
    setCopied(false);
    if (!(widthNum > 0) || !(heightNum > 0)) {
      setUploadError("Enter the ordered width and height in inches.");
      return;
    }
    const form = new FormData();
    form.set("widthIn", widthIn);
    form.set("heightIn", heightIn);
    form.set("productId", productId);
    let nextPreview = "";
    let name = "";
    if (mode === "sample") {
      if (!demoFile) {
        setUploadError("Pick a sample file first.");
        return;
      }
      form.set("demoFile", demoFile);
      name = demoFile;
      if (selectedSample?.kind === "png") nextPreview = `/api/demo-image?name=${encodeURIComponent(demoFile)}`;
    } else {
      if (!file) {
        setUploadError("Choose a PNG or PDF file first.");
        return;
      }
      form.set("file", file);
      name = file.name;
      if (/\.png$/i.test(file.name)) nextPreview = URL.createObjectURL(file);
    }
    setBusy(true);
    try {
      const res = await fetch("/api/preflight", { method: "POST", body: form });
      const body = await res.json().catch(() => ({ error: `The server answered ${res.status}.` }));
      if (!res.ok) {
        if (nextPreview.startsWith("blob:")) URL.revokeObjectURL(nextPreview);
        setUploadError(body.error ?? "Preflight failed. Try again.");
        return;
      }
      if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
      setPanel(body as Panel);
      setRan({ widthIn: widthNum, heightIn: heightNum, productId, name });
      setPreviewUrl(nextPreview);
      requestAnimationFrame(() => {
        resultRef.current?.focus({ preventScroll: true });
        if (window.matchMedia("(max-width: 959px)").matches) {
          const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          resultRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
        }
      });
    } catch {
      if (nextPreview.startsWith("blob:")) URL.revokeObjectURL(nextPreview);
      setUploadError("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const result = panel?.result ?? null;
  const verdictKind: "pass" | "fail" | "review" = !result ? "review" : result.verdict === "PASS" ? "pass" : "fail";
  const rowFails = panel?.rows.filter((r) => r.ok === false).map((r) => r.label.toLowerCase()) ?? [];
  const unchecked = panel?.rows.filter((r) => r.source === "unavailable").map((r) => r.label) ?? [];

  return (
    <div className="shell">
      <a className="skip" href="#result">
        Skip to result
      </a>
      <header className="topbar">
        <span className="brand">
          <Logo /> ProofPilot
        </span>
        <span className="tagline">One print file, measured, then decided.</span>
      </header>

      <main className="layout">
        <section className="card inputs" aria-labelledby="inputs-title">
          <h1 id="inputs-title">Check one proof.</h1>
          <p className="lede">Pick a file, enter the ordered size and product, then run preflight.</p>
          <form className="form" onSubmit={runPreflight} noValidate>
            <fieldset className="segmented">
              <legend className="sr-only">File source</legend>
              <label>
                <input type="radio" name="mode" value="sample" checked={mode === "sample"} onChange={() => setMode("sample")} />
                Sample file
              </label>
              <label>
                <input type="radio" name="mode" value="upload" checked={mode === "upload"} onChange={() => setMode("upload")} />
                Your file
              </label>
            </fieldset>

            {mode === "sample" ? (
              <div className="field">
                <label className="label" htmlFor={ids.sample}>
                  Sample from the test corpus
                </label>
                <select
                  id={ids.sample}
                  className="control"
                  value={demoFile}
                  onChange={(e) => applySample(samples.find((s) => s.file === e.target.value))}
                  disabled={samples.length === 0}
                  aria-describedby={`${ids.sample}-hint`}
                >
                  {samples.length === 0 ? <option value="">Loading samples</option> : null}
                  <optgroup label={`Art files (${artSamples.length})`}>
                    {artSamples.map((s) => (
                      <option key={s.file} value={s.file}>
                        {sampleLabel(s)}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={`Geometry files (${geometrySamples.length})`}>
                    {geometrySamples.map((s) => (
                      <option key={s.file} value={s.file}>
                        {sampleLabel(s)}
                      </option>
                    ))}
                  </optgroup>
                </select>
                <p className="hint" id={`${ids.sample}-hint`}>
                  {selectedSample?.note
                    ? `${selectedSample.note}. Size and product fill in from the order.`
                    : "Size and product fill in from the order."}
                </p>
              </div>
            ) : (
              <div className="field">
                <span className="label" id={`${ids.file}-label`}>
                  File (PNG or PDF)
                </span>
                <label
                  className={`drop${dragging ? " dragging" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    pickFile(e.dataTransfer.files?.[0] ?? null);
                  }}
                >
                  <input
                    id={ids.file}
                    type="file"
                    accept=".png,.pdf,image/png,application/pdf"
                    aria-labelledby={`${ids.file}-label`}
                    aria-describedby={`${ids.file}-hint`}
                    onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                  />
                  <strong>{file ? file.name : "Choose a file"}</strong>
                  <span className="hint" id={`${ids.file}-hint`}>
                    {file ? formatBytes(file.size) : "Tap to browse or drop it here. PNG or PDF, up to 4.5 MB."}
                  </span>
                </label>
              </div>
            )}

            <div className="pair">
              <div className="field">
                <label className="label" htmlFor={ids.width}>
                  Ordered width
                </label>
                <div className="unit" data-unit="in">
                  <input
                    id={ids.width}
                    className="control"
                    type="number"
                    inputMode="decimal"
                    min="0.1"
                    step="0.01"
                    value={widthIn}
                    aria-invalid={widthBad}
                    onChange={(e) => setWidthIn(e.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label className="label" htmlFor={ids.height}>
                  Ordered height
                </label>
                <div className="unit" data-unit="in">
                  <input
                    id={ids.height}
                    className="control"
                    type="number"
                    inputMode="decimal"
                    min="0.1"
                    step="0.01"
                    value={heightIn}
                    aria-invalid={heightBad}
                    onChange={(e) => setHeightIn(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="field">
              <label className="label" htmlFor={ids.product}>
                Product
              </label>
              <select id={ids.product} className="control" value={productId} onChange={(e) => setProductId(e.target.value)}>
                {products.length === 0 ? <option value={productId}>Die-Cut Stickers</option> : null}
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </select>
            </div>

            {uploadError || loadError ? (
              <p className="alert" role="alert" id={ids.err}>
                {uploadError || loadError}
              </p>
            ) : null}

            <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
              {busy ? (
                <>
                  <span className="spinner" aria-hidden="true" /> Measuring
                </>
              ) : (
                "Run preflight"
              )}
            </button>
          </form>
        </section>

        <section className="results" id="result" aria-labelledby="result-title" aria-live="polite" aria-busy={busy}>
          <h2 id="result-title" ref={resultRef} tabIndex={-1} className="sr-only">
            Measured result
          </h2>
          {busy && !panel ? (
            <div className="card skeleton" aria-label="Measuring">
              <div />
              <div />
              <div />
              <div />
            </div>
          ) : !panel ? (
            <div className="card empty">
              <h2>What gets measured</h2>
              <ol>
                <li>Resolution at the ordered size, from the pixel count.</li>
                <li>Bleed, RGB black and transparency, from the decoded pixels.</li>
                <li>Cut line and white ink, from the PDF spot colors or the sample sidecar.</li>
              </ol>
              <table className="thresholds">
                <caption className="sr-only">Pass thresholds</caption>
                <tbody>
                  <tr>
                    <th scope="row">Resolution</th>
                    <td>300 PPI passes. Under 200 PPI fails.</td>
                  </tr>
                  <tr>
                    <th scope="row">Bleed past cut line</th>
                    <td>0.125in or more</td>
                  </tr>
                  <tr>
                    <th scope="row">Cut line</th>
                    <td>Die-cut, clear and holographic</td>
                  </tr>
                  <tr>
                    <th scope="row">White underbase</th>
                    <td>Clear and holographic</td>
                  </tr>
                  <tr>
                    <th scope="row">Smallest text</th>
                    <td>6pt or more</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <>
              <div className={`verdict ${verdictKind}`}>
                <VerdictIcon kind={verdictKind} />
                <div>
                  <p className="kicker">{result ? result.verdict : "Needs artist review"}</p>
                  <p className="headline">
                    {!result
                      ? rowFails.length
                        ? `Fails: ${rowFails.join(", ")}. Other checks need a raster step.`
                        : "Measured checks pass. Other checks need a raster step."
                      : result.verdict === "PASS"
                        ? "Clean. Ready to approve."
                        : `Needs a fix: ${failList(result.fails)}.`}
                  </p>
                  <p className="sub">
                    {ran?.name}
                    {ran ? ` · ${ranSpec?.displayName ?? ran.productId} · ${ran.widthIn}x${ran.heightIn}in` : ""}
                  </p>
                </div>
              </div>

              {panel.groundTruth ? (
                <p className="truth">
                  {panel.groundTruth.sameOrder
                    ? panel.groundTruth.matches
                      ? `Matches the corpus ground truth (${panel.groundTruth.expectedVerdict}${panel.groundTruth.expectedFails.length ? `: ${panel.groundTruth.expectedFails.join(", ")}` : ""}).`
                      : `Differs from the corpus ground truth (${panel.groundTruth.expectedVerdict}${panel.groundTruth.expectedFails.length ? `: ${panel.groundTruth.expectedFails.join(", ")}` : ""}).`
                    : "You changed the size or product, so the corpus ground truth does not apply."}
                </p>
              ) : null}

              {unchecked.length > 0 ? (
                <p className="truth">Not checked in this file type: {unchecked.join(", ")}. An artist checks these.</p>
              ) : null}

              <div className="card">
                {result && previewUrl && ran ? (
                  <Preview
                    src={previewUrl}
                    result={result}
                    ordered={ran}
                    bleedRequiredIn={ranSpec?.bleedRequiredIn ?? 0.125}
                  />
                ) : (
                  <div className="pdf-note">
                    PDF pages are not rendered here. Cut line and white ink are read from the PDF spot colors.
                  </div>
                )}
              </div>

              <div className="card">
                <h2>Checks</h2>
                <ul className="checks">
                  {panel.rows.map((r) => (
                    <CheckRow key={r.id} row={r} />
                  ))}
                </ul>
              </div>

              {message ? (
                <div className="card">
                  <div className="message-head">
                    <h2>{result?.verdict === "PASS" ? "Approval note" : "Fix note"}</h2>
                    <button type="button" className="btn btn-ghost" onClick={copyMessage}>
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <pre className="message">{message}</pre>
                </div>
              ) : null}

              <div className="card">
                <div className="actions">
                  {result?.verdict === "PASS" ? (
                    <button type="button" className="btn btn-primary" onClick={() => setDecision("sent")}>
                      Approve &amp; send
                    </button>
                  ) : result || rowFails.length > 0 ? (
                    <button type="button" className="btn btn-primary" onClick={() => setDecision("fix-note")}>
                      Send fix note
                    </button>
                  ) : null}
                  {result?.verdict === "PASS" ? null : (
                    <a className="btn btn-secondary" href={escalateHref()}>
                      Escalate to support
                    </a>
                  )}
                </div>
                <p className="status" role="status">
                  {decision === "sent"
                    ? "Marked as approved. This prototype sends nothing."
                    : decision === "fix-note"
                      ? "Fix note marked as sent. This prototype sends nothing."
                      : ""}
                </p>
              </div>
            </>
          )}
        </section>
      </main>

      <footer className="foot">
        Samples are generated test files with known answers.{" "}
        <a href="https://github.com/sivaratrisrinivas/proofcut">Source on GitHub</a>
      </footer>
    </div>
  );
}
