"use client";

import { useEffect, useState } from "react";
import type { ProductSpec } from "../src/preflight";
import type { UploadPanel } from "../src/upload";

export default function UploadPage() {
  const [products, setProducts] = useState<ProductSpec[]>([]);
  const [demoFiles, setDemoFiles] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [demoFile, setDemoFile] = useState("");
  const [widthIn, setWidthIn] = useState("3");
  const [heightIn, setHeightIn] = useState("3");
  const [productId, setProductId] = useState("die-cut");
  const [panel, setPanel] = useState<UploadPanel | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/preflight")
      .then((r) => r.json())
      .then((d) => {
        setProducts(d.products ?? []);
        setDemoFiles(d.demoFiles ?? []);
      })
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPanel(null);
    const form = new FormData();
    form.set("widthIn", widthIn);
    form.set("heightIn", heightIn);
    form.set("productId", productId);
    if (demoFile) form.set("demoFile", demoFile);
    else if (file) form.set("file", file);
    else {
      setError("Choose a file or a demo file.");
      return;
    }
    const res = await fetch("/api/preflight", { method: "POST", body: form });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "preflight failed");
      return;
    }
    setPanel(body as UploadPanel);
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
    </div>
  );
}
