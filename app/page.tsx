"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProductSpec } from "../src/preflight";
import type { UploadPanel } from "../src/upload";
import { buildChecklist, composeMessage, overlaySpec } from "../src/draft";

export default function UploadPage() {
  const [products, setProducts] = useState<ProductSpec[]>([]);
  const [demoFiles, setDemoFiles] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [demoFile, setDemoFile] = useState("");
  const [widthIn, setWidthIn] = useState("3");
  const [heightIn, setHeightIn] = useState("3");
  const [productId, setProductId] = useState("die-cut");
  const [panel, setPanel] = useState<UploadPanel | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

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

  const draft = useMemo(() => {
    if (!panel?.result) return null;
    try {
      return {
        overlay: overlaySpec(panel.result),
        checklist: buildChecklist(panel.result),
        message: composeMessage(panel.result),
      };
    } catch {
      return null;
    }
  }, [panel]);

  const bleedPct = useMemo(() => {
    if (!draft) return 0;
    const w = Number(widthIn);
    if (!Number.isFinite(w) || w <= 0) return 0;
    return Math.min(18, Math.max(0, (draft.overlay.bleed.widthIn / w) * 100));
  }, [draft, widthIn]);

  async function copyMessage() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft.message);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = draft.message;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPanel(null);
    setCopied(false);
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
      setError("Choose a file or a demo file.");
      return;
    }
    const res = await fetch("/api/preflight", { method: "POST", body: form });
    const body = await res.json();
    if (!res.ok) {
      if (nextPreview.startsWith("blob:")) URL.revokeObjectURL(nextPreview);
      setError(body.error ?? "preflight failed");
      return;
    }
    setPanel(body as UploadPanel);
    setPreviewUrl(nextPreview);
  }

  return (
    <div>
      <h1>ProofPilot upload</h1>
      <p>Upload art with ordered size and product type. Numbers come from the preflight seam only.</p>
      <form onSubmit={submit} style={{ display: "grid", gap: 12, maxWidth: 480 }}>
        <label>
          File (PNG or PDF)
          <input type="file" accept=".png,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <label>
          Or demo file
          <select value={demoFile} onChange={(e) => setDemoFile(e.target.value)}>
            <option value="">— upload instead —</option>
            {demoFiles.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </label>
        <label>
          Ordered width (in)
          <input value={widthIn} onChange={(e) => setWidthIn(e.target.value)} inputMode="decimal" />
        </label>
        <label>
          Ordered height (in)
          <input value={heightIn} onChange={(e) => setHeightIn(e.target.value)} inputMode="decimal" />
        </label>
        <label>
          Product
          <select value={productId} onChange={(e) => setProductId(e.target.value)}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.displayName}</option>
            ))}
          </select>
        </label>
        <button type="submit">Run preflight</button>
      </form>
      {error ? <p role="alert">Error: {error}</p> : null}
      {panel ? (
        <section style={{ marginTop: 24 }}>
          <h2>
            {panel.result ? `Verdict: ${panel.result.verdict}` : "Needs artist review"}
            {panel.result && panel.result.fails.length > 0 ? ` — ${panel.result.fails.join(", ")}` : null}
          </h2>
          {panel.needsReview ? <p>Some rows are not extractable from this file yet.</p> : null}
          <table>
            <thead>
              <tr><th>Check</th><th>Measurement</th><th>Source</th></tr>
            </thead>
            <tbody>
              {panel.rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.label}</td>
                  <td>{r.display}</td>
                  <td>{r.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
      {panel ? (
        <section style={{ marginTop: 32 }}>
          <h2>Draft view</h2>
          {!panel.result || !draft ? (
            <p>
              Draft view needs a full verdict. Raw uploads carry partial measured rows only —
              pick a demo file for the full overlay, checklist, and message path.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 24 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <figure style={{ margin: 0 }}>
                  <figcaption>Original</figcaption>
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewUrl}
                      alt="Original upload"
                      style={{ width: "100%", display: "block", background: "#fff", border: "1px solid #ddd" }}
                    />
                  ) : (
                    <p>No preview available.</p>
                  )}
                </figure>
                <figure style={{ margin: 0 }}>
                  <figcaption>
                    Draft
                    {draft.overlay.cutline.visible ? " — CutContour (dashed magenta)" : " — CutContour missing"}
                    {draft.overlay.bleed.visible
                      ? ` — bleed ${draft.overlay.bleed.widthIn.toFixed(3)}in`
                      : " — no bleed"}
                  </figcaption>
                  {previewUrl ? (
                    <div style={{ position: "relative", border: "1px solid #ddd", background: "#fff" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={previewUrl} alt="Draft preview" style={{ width: "100%", display: "block" }} />
                      {draft.overlay.bleed.visible ? (
                        <div
                          data-testid="bleed-overlay"
                          title={`Bleed ${draft.overlay.bleed.widthIn.toFixed(3)}in past cut line`}
                          style={{
                            position: "absolute",
                            inset: 0,
                            boxShadow: `inset 0 0 0 ${Math.max(4, bleedPct)}px rgba(0, 120, 255, 0.35)`,
                            pointerEvents: "none",
                          }}
                        />
                      ) : null}
                      {draft.overlay.cutline.visible ? (
                        <div
                          data-testid="cutline-overlay"
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
                  ) : (
                    <p>No preview available.</p>
                  )}
                </figure>
              </div>
              <div>
                <h3>QC checklist</h3>
                <p>Ticks come from code measurements only.</p>
                <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
                  {draft.checklist.map((t) => (
                    <li key={t.id} data-testid={`check-${t.id}`}>
                      <span aria-hidden>{t.ok ? "✓" : "✗"}</span> <strong>{t.label}</strong>: {t.detail}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Customer message</h3>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    background: "#fff",
                    border: "1px solid #ddd",
                    padding: 12,
                  }}
                >
                  {draft.message}
                </pre>
                <button type="button" onClick={copyMessage}>
                  {copied ? "Copied" : "Copy message"}
                </button>
              </div>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
