"use client";

import { useEffect, useMemo, useState } from "react";
import type { PreflightResult, ProductSpec } from "../src/preflight";
import type { UploadPanel } from "../src/upload";
import { buildChecklist, composeMessage, overlaySpec } from "../src/draft";

const ink = "#111";
const faint = "#777";

const shell: React.CSSProperties = {
  maxWidth: 1280,
  margin: "0 auto",
  padding: "32px 24px 64px",
  fontFamily: "system-ui, sans-serif",
  color: ink,
  background: "#fff",
};

const primaryBtn: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "16px",
  fontSize: 17,
  fontWeight: 600,
  color: "#fff",
  background: ink,
  border: "none",
  borderRadius: 12,
  cursor: "pointer",
};

const fieldStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 15,
};

const inputStyle: React.CSSProperties = {
  padding: "12px",
  fontSize: 16,
  border: "1px solid #ddd",
  borderRadius: 8,
  background: "#fff",
  color: ink,
};

const quietLink: React.CSSProperties = { color: faint, fontSize: 14, textDecoration: "none" };

interface DraftView {
  overlay: { cutline: { visible: boolean }; bleed: { visible: boolean; widthIn: number } };
  checklist: Array<{ id: string; ok: boolean; label: string; detail: string }>;
  message: string;
}

function buildDraftView(result: PreflightResult | null | undefined): DraftView | null {
  if (!result) return null;
  try {
    return {
      overlay: overlaySpec(result),
      checklist: buildChecklist(result),
      message: composeMessage(result),
    };
  } catch {
    return null;
  }
}

function bleedPctFor(orderedWidthIn: number, bleedWidthIn: number): number {
  if (!Number.isFinite(orderedWidthIn) || orderedWidthIn <= 0) return 0;
  return Math.min(18, Math.max(0, (bleedWidthIn / orderedWidthIn) * 100));
}

export default function ReviewLoop() {
  const [products, setProducts] = useState<ProductSpec[]>([]);
  const [demoFiles, setDemoFiles] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [demoFile, setDemoFile] = useState("");
  const [widthIn, setWidthIn] = useState("3");
  const [heightIn, setHeightIn] = useState("3");
  const [productId, setProductId] = useState("die-cut");
  const [panel, setPanel] = useState<UploadPanel | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [decision, setDecision] = useState<"sent" | "fix-note" | null>(null);

  useEffect(() => {
    fetch("/api/preflight")
      .then((r) => r.json())
      .then((d) => {
        setProducts(d.products ?? []);
        setDemoFiles(d.demoFiles ?? []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const uploadDraft = useMemo(() => buildDraftView(panel?.result), [panel]);

  const uploadBleedPct = useMemo(
    () => (uploadDraft ? bleedPctFor(Number(widthIn), uploadDraft.overlay.bleed.widthIn) : 0),
    [uploadDraft, widthIn],
  );

  function escalateHref(result: PreflightResult): string {
    const m = result.measurements;
    const subject = encodeURIComponent(`ProofPilot escalation: ${productId} (${result.fails.join(", ")})`);
    const body = encodeURIComponent(
      `ProofPilot ${productId} proof needs support review.\nVerdict: ${result.verdict}\nFails: ${result.fails.join(", ") || "none"}\nMeasurements: ${Math.round(m.ppi)} PPI, bleed ${m.bleedWidthIn.toFixed(3)}in, ${m.pixelWidth}x${m.pixelHeight}px at ${widthIn}x${heightIn}in.`,
    );
    return `mailto:support@proofpilot.example?subject=${subject}&body=${body}`;
  }

  async function runPreflight() {
    setUploadError("");
    setPanel(null);
    setDecision(null);
    if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    const form = new FormData();
    form.set("widthIn", widthIn);
    form.set("heightIn", heightIn);
    form.set("productId", productId);
    let nextPreview = "";
    if (demoFile) {
      form.set("demoFile", demoFile);
      nextPreview = `/api/demo-image?name=${encodeURIComponent(demoFile)}`;
    } else if (file) {
      form.set("file", file);
      nextPreview = URL.createObjectURL(file);
    } else {
      setUploadError("Choose a file or a demo file first.");
      return;
    }
    const res = await fetch("/api/preflight", { method: "POST", body: form });
    const body = await res.json();
    if (!res.ok) {
      if (nextPreview.startsWith("blob:")) URL.revokeObjectURL(nextPreview);
      setUploadError(body.error ?? "preflight failed");
      return;
    }
    setPanel(body as UploadPanel);
    setPreviewUrl(nextPreview);
  }

  function draftFigure(
    imageSrc: string,
    imageAlt: string,
    overlay: { cutline: { visible: boolean }; bleed: { visible: boolean; widthIn: number } },
    bleedPct: number,
  ) {
    return (
      <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#f6f6f8" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageSrc} alt={imageAlt} style={{ width: "100%", display: "block" }} />
        {overlay.bleed.visible ? (
          <div
            title={`Bleed ${overlay.bleed.widthIn.toFixed(3)}in past cut line`}
            style={{
              position: "absolute",
              inset: 0,
              boxShadow: `inset 0 0 0 ${Math.max(4, bleedPct)}px rgba(0, 120, 255, 0.35)`,
              pointerEvents: "none",
            }}
          />
        ) : null}
        {overlay.cutline.visible ? (
          <div
            title="CutContour path"
            style={{
              position: "absolute",
              inset: "6%",
              border: "2px dashed magenta",
              pointerEvents: "none",
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div style={shell}>
      <header style={{ display: "flex", alignItems: "baseline", marginBottom: 32 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>ProofPilot</span>
        <span style={{ marginLeft: "auto", fontSize: 13, color: faint }}>One proof, measured, decided.</span>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 32, alignItems: "start" }}>
        <section aria-label="Proof inputs">
          <h1 style={{ fontSize: 28, margin: "0 0 8px" }}>Check one proof.</h1>
          <div style={{ display: "grid", gap: 16 }}>
            <label style={fieldStyle}>
              File (PNG or PDF)
              <input type="file" accept=".png,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <label style={fieldStyle}>
              Or a demo file
              <select value={demoFile} onChange={(e) => setDemoFile(e.target.value)} style={inputStyle}>
                <option value="">— pick one —</option>
                {demoFiles.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </label>
            <label style={fieldStyle}>
              Ordered width (in)
              <input value={widthIn} onChange={(e) => setWidthIn(e.target.value)} inputMode="decimal" style={inputStyle} />
            </label>
            <label style={fieldStyle}>
              Ordered height (in)
              <input value={heightIn} onChange={(e) => setHeightIn(e.target.value)} inputMode="decimal" style={inputStyle} />
            </label>
            <label style={fieldStyle}>
              Product
              <select value={productId} onChange={(e) => setProductId(e.target.value)} style={inputStyle}>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.displayName}</option>
                ))}
              </select>
            </label>
          </div>
          {uploadError ? <p role="alert">{uploadError}</p> : null}
          <div style={{ marginTop: 24 }}>
            <button type="button" style={primaryBtn} onClick={runPreflight}>Run preflight</button>
          </div>
        </section>
        <section aria-label="Measured result">
          {!panel || !panel.result ? (
            <p style={{ color: faint }}>Run preflight to measure this proof.</p>
          ) : (
            <div>
              <p style={{ color: faint }}>{panel.result.verdict === "PASS" ? "Clean." : "Needs a fix."}</p>
              {panel.result.fails.length > 0 ? (
                <p style={{ color: faint }}>{panel.result.fails.join(", ")}</p>
              ) : null}
              {panel.needsReview ? <p style={{ color: faint }}>Some rows are not extractable from this file yet.</p> : null}
              <table>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", fontSize: 13, color: faint, fontWeight: 400 }}>Check</th>
                    <th style={{ textAlign: "left", fontSize: 13, color: faint, fontWeight: 400 }}>Measurement</th>
                    <th style={{ textAlign: "left", fontSize: 13, color: faint, fontWeight: 400 }}>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {panel.rows.map((r) => (
                    <tr key={r.id}>
                      <td style={{ padding: "6px 12px 6px 0", color: faint }}>{r.label}</td>
                      <td style={{ padding: "6px 12px 6px 0" }}>{r.display}</td>
                      <td style={{ padding: "6px 0", color: faint, fontSize: 13 }}>{r.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {uploadDraft && previewUrl ? (
                <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
                  {draftFigure(previewUrl, "Draft preview", uploadDraft.overlay, uploadBleedPct)}
                  <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
                    {uploadDraft.checklist.map((t) => (
                      <li key={t.id}>
                        <span aria-hidden>{t.ok ? "✓" : "✗"}</span> <strong>{t.label}</strong>{" "}
                        <span style={{ color: faint }}>{t.detail}</span>
                      </li>
                    ))}
                  </ul>
                  <pre style={{ whiteSpace: "pre-wrap", background: "#f6f6f8", padding: 12, borderRadius: 8 }}>
                    {uploadDraft.message}
                  </pre>
                </div>
              ) : null}
              <div style={{ marginTop: 24 }}>
                {panel.result.verdict === "PASS" ? (
                  <button type="button" style={primaryBtn} onClick={() => setDecision("sent")}>
                    Approve &amp; send
                  </button>
                ) : (
                  <button type="button" style={primaryBtn} onClick={() => setDecision("fix-note")}>
                    Send fix note
                  </button>
                )}
              </div>
              {panel.result.verdict === "PASS" ? null : (
                <p style={{ marginTop: 16 }}>
                  <a href={escalateHref(panel.result)} style={quietLink}>Escalate to support</a>
                </p>
              )}
              {decision === "sent" ? <p style={{ color: faint }}>Sent.</p> : null}
              {decision === "fix-note" ? <p style={{ color: faint }}>Fix note sent.</p> : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
