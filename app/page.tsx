"use client";

import { useEffect, useMemo, useState } from "react";
import type { PreflightResult, ProductSpec } from "../src/preflight";
import type { Job } from "../src/queue";
import type { AuditEntry } from "../src/audit";
import type { ReviewDecision } from "../src/review";
import type { UploadPanel } from "../src/upload";
import type { Dashboard } from "../src/metrics";
import { HOLD_RATE_GUARD, TOUCHES_AFTER, TOUCHES_BEFORE } from "../src/metrics";
import type { RoiInputs } from "../src/roi";
import { computeRoi, defaultRoiInputs, roiAssumptions } from "../src/roi";
import { buildChecklist, composeMessage, overlaySpec } from "../src/draft";
import { DEMO_SESSION_KEY, DEMO_USER, createDemoSession, isDemoSession } from "../src/demoAuth";
import { nextUndecidedJob } from "../src/loop";

const DEMO_ACTOR = DEMO_USER;

const ink = "#111";
const faint = "#777";
const accent = "#c026d3";

const shell: React.CSSProperties = {
  maxWidth: 560,
  margin: "0 auto",
  padding: "32px 24px 64px",
  fontFamily: "system-ui, sans-serif",
  color: ink,
  background: "#fff",
};

const wideShell: React.CSSProperties = {
  ...shell,
  maxWidth: 1280,
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

function verdictPill(verdict: "PASS" | "SOFT-FAIL"): React.CSSProperties {
  const pass = verdict === "PASS";
  return {
    fontSize: 11,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 999,
    background: pass ? "#e6f4ea" : "#fef3c7",
    color: pass ? "#137333" : "#92400e",
    whiteSpace: "nowrap",
  };
}

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

const ROI_SLIDERS: Array<{ key: keyof RoiInputs; min: number; max: number; step: number }> = [
  { key: "ordersPerMonth", min: 10_000, max: 200_000, step: 1_000 },
  { key: "percentManual", min: 0, max: 100, step: 1 },
  { key: "minutesSavedPerOrder", min: 0, max: 20, step: 0.5 },
  { key: "dollarsPerMinute", min: 0, max: 1.5, step: 0.05 },
  { key: "reprintPct", min: 0, max: 5, step: 0.1 },
  { key: "costPerReprint", min: 0, max: 50, step: 0.5 },
  { key: "capturePct", min: 0, max: 50, step: 0.5 },
];

const usdWhole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function MetricCard({
  testid,
  label,
  value,
  children,
}: {
  testid: string;
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ border: "1px solid #eee", background: "#fff", padding: 16, borderRadius: 12 }} data-testid={testid}>
      <div style={{ fontSize: 13, color: faint }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 13, color: faint }}>{children}</div>
    </div>
  );
}

type View = "loop" | "new" | "insights";
type LoopScreen = "upnext" | "decide";

export default function ReviewLoop() {
  const [session, setSession] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [view, setView] = useState<View>("loop");
  const [loopScreen, setLoopScreen] = useState<LoopScreen>("upnext");
  const [queue, setQueue] = useState<Job[]>([]);
  const [jobId, setJobId] = useState("");
  const [startMs, setStartMs] = useState(0);
  const [nowMs, setNowMs] = useState(0);
  const [decided, setDecided] = useState<Record<string, ReviewDecision>>({});
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [flash, setFlash] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [metrics, setMetrics] = useState<Dashboard | null>(null);
  const [roiInputs, setRoiInputs] = useState<RoiInputs>(() => defaultRoiInputs());

  const [products, setProducts] = useState<ProductSpec[]>([]);
  const [demoFiles, setDemoFiles] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [demoFile, setDemoFile] = useState("");
  const [widthIn, setWidthIn] = useState("3");
  const [heightIn, setHeightIn] = useState("3");
  const [productId, setProductId] = useState("die-cut");
  const [newStep, setNewStep] = useState(1);
  const [panel, setPanel] = useState<UploadPanel | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DEMO_SESSION_KEY);
      setSession(isDemoSession(stored) ? (stored as string) : null);
    } catch {
      setSession(null);
    }
    setSessionChecked(true);
  }, []);

  useEffect(() => {
    fetch("/api/queue?filter=all")
      .then((r) => r.json())
      .then((d) => setQueue(d.jobs ?? []))
      .catch(() => {});
    fetch("/api/metrics")
      .then((r) => r.json())
      .then((d) => {
        if (d.dashboard) setMetrics(d.dashboard as Dashboard);
      })
      .catch(() => {});
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

  useEffect(() => {
    if (loopScreen !== "decide") return;
    setNowMs(Date.now());
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [loopScreen, jobId]);

  const decidedIds = useMemo(() => new Set(Object.keys(decided)), [decided]);
  const upNext = useMemo(() => nextUndecidedJob(queue, decidedIds), [queue, decidedIds]);
  const job = useMemo(() => queue.find((j) => j.id === jobId) ?? null, [queue, jobId]);
  const elapsedS = Math.max(0, Math.round((nowMs - startMs) / 1000));

  const assumptions = useMemo(() => roiAssumptions(), []);
  const roi = useMemo(() => {
    try {
      return computeRoi(roiInputs);
    } catch {
      return null;
    }
  }, [roiInputs]);
  const decidedCount = Object.keys(decided).length;
  const liveTouchesPerJob =
    metrics && metrics.total > 0 ? (decidedCount * TOUCHES_AFTER) / metrics.total : 0;

  const jobDraft = useMemo(() => (job ? buildDraftView(job.result) : null), [job]);

  const jobBleedPct = useMemo(
    () => (jobDraft && job ? bleedPctFor(job.ordered.widthIn, jobDraft.overlay.bleed.widthIn) : 0),
    [jobDraft, job],
  );

  const uploadDraft = useMemo(() => buildDraftView(panel?.result), [panel]);

  const uploadBleedPct = useMemo(
    () => (uploadDraft ? bleedPctFor(Number(widthIn), uploadDraft.overlay.bleed.widthIn) : 0),
    [uploadDraft, widthIn],
  );

  function login() {
    try {
      localStorage.setItem(DEMO_SESSION_KEY, createDemoSession());
    } catch {
      // storage unavailable; keep session in memory only
    }
    setSession(DEMO_USER);
  }

  function go(v: View) {
    setView(v);
    setFlash("");
    setReviewError("");
    if (v === "loop") {
      setLoopScreen("upnext");
      setJobId("");
    }
    if (v === "new") {
      setNewStep(1);
      setPanel(null);
      setUploadError("");
      setCopied(false);
    }
  }

  function start(id: string) {
    setJobId(id);
    setStartMs(Date.now());
    setNowMs(Date.now());
    setFlash("");
    setReviewError("");
    setLoopScreen("decide");
  }

  function escalateHref(j: Job): string {
    const subject = encodeURIComponent(`ProofPilot escalation: ${j.id} (${j.result.fails.join(", ")})`);
    const body = encodeURIComponent(
      `Job ${j.id} (${j.productId}) needs support review.\nVerdict: ${j.result.verdict}\nFails: ${j.result.fails.join(", ") || "none"}\nMeasurements: ${Math.round(j.result.measurements.ppi)} PPI, bleed ${j.result.measurements.bleedWidthIn.toFixed(3)}in.`,
    );
    return `mailto:support@proofpilot.example?subject=${subject}&body=${body}`;
  }

  async function review(decision: ReviewDecision) {
    if (!job) return;
    setReviewError("");
    const elapsedMs = Date.now() - startMs;
    const res = await fetch("/api/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jobId: job.id,
        decision,
        actor: decision === "auto-send" ? "system" : DEMO_ACTOR,
        elapsedMs,
        confidence: decision === "auto-send" ? "high" : undefined,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      setReviewError(body.error ?? "review failed");
      return;
    }
    setAudit((a) => [...a, body.entry as AuditEntry]);
    setDecided((d) => ({ ...d, [job.id]: decision }));
    setFlash(decision === "auto-send" ? "Sent." : decision === "approve" ? "Approved." : "Fix note sent.");
    setJobId("");
    setLoopScreen("upnext");
  }

  function setRoi(key: keyof RoiInputs, value: number) {
    if (!Number.isFinite(value) || value < 0) return;
    setRoiInputs((prev) => ({ ...prev, [key]: value }));
  }

  async function copyMessage() {
    if (!uploadDraft) return;
    try {
      await navigator.clipboard.writeText(uploadDraft.message);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = uploadDraft.message;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function runPreflight() {
    setUploadError("");
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
    setNewStep(3);
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

  if (!sessionChecked) {
    return (
      <div style={shell}>
        <p style={{ color: faint }}>Loading demo session…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={shell}>
        <p style={{ fontSize: 13, color: faint }}>ProofPilot</p>
        <h1 style={{ fontSize: 34, margin: "8px 0" }}>One job at a time.</h1>
        <p style={{ color: faint }}>Single demo login stands in for auth. No password, no private data.</p>
        <div style={{ marginTop: 32 }}>
          <button type="button" style={primaryBtn} onClick={login}>
            Continue as {DEMO_USER}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={view === "loop" ? wideShell : shell}>
      <header style={{ display: "flex", alignItems: "baseline", marginBottom: 32 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>ProofPilot</span>
        <nav style={{ marginLeft: "auto", display: "flex", gap: 16 }}>
          <a href="#" onClick={(e) => { e.preventDefault(); go("loop"); }} style={{ ...quietLink, fontWeight: view === "loop" ? 700 : 400, color: view === "loop" ? ink : faint }}>Loop</a>
          <a href="#" onClick={(e) => { e.preventDefault(); go("new"); }} style={{ ...quietLink, fontWeight: view === "new" ? 700 : 400, color: view === "new" ? ink : faint }}>New</a>
          <a href="#" onClick={(e) => { e.preventDefault(); go("insights"); }} style={{ ...quietLink, fontWeight: view === "insights" ? 700 : 400, color: view === "insights" ? ink : faint }}>Insights</a>
        </nav>
      </header>

      {view === "new" ? (
        <div>
          {newStep === 1 ? (
            <div>
              <h1 style={{ fontSize: 28 }}>What are we proofing?</h1>
              <label style={fieldStyle}>
                File (PNG or PDF)
                <input type="file" accept=".png,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
              <div style={{ marginTop: 16 }}>
                <label style={fieldStyle}>
                  Or a demo file
                  <select value={demoFile} onChange={(e) => setDemoFile(e.target.value)} style={inputStyle}>
                    <option value="">— pick one —</option>
                    {demoFiles.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </label>
              </div>
              {uploadError ? <p role="alert">{uploadError}</p> : null}
              <div style={{ marginTop: 32 }}>
                <button
                  type="button"
                  style={primaryBtn}
                  onClick={() => {
                    if (!file && !demoFile) {
                      setUploadError("Choose a file or a demo file first.");
                      return;
                    }
                    setUploadError("");
                    setNewStep(2);
                  }}
                >
                  Continue
                </button>
              </div>
            </div>
          ) : null}
          {newStep === 2 ? (
            <div>
              <h1 style={{ fontSize: 28 }}>How big, what product?</h1>
              <div style={{ display: "grid", gap: 16 }}>
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
              <div style={{ marginTop: 32 }}>
                <button type="button" style={primaryBtn} onClick={runPreflight}>Run preflight</button>
              </div>
            </div>
          ) : null}
          {newStep === 3 ? (
            <div>
              {panel?.result ? (
                <p style={{ color: faint }}>{panel.result.verdict === "PASS" ? "Clean." : "Needs a fix."}</p>
              ) : (
                <h1 style={{ fontSize: 28, margin: "0 0 8px" }}>Measured.</h1>
              )}
              {panel?.result && panel.result.fails.length > 0 ? (
                <p style={{ color: faint }}>{panel.result.fails.join(", ")}</p>
              ) : null}
              {panel?.needsReview ? <p style={{ color: faint }}>Some rows are not extractable from this file yet.</p> : null}
              {uploadError ? <p role="alert">{uploadError}</p> : null}
              {panel ? (
                <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
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
                  {panel.result && uploadDraft && previewUrl ? (
                    <div style={{ display: "grid", gap: 16 }}>
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
                      <button type="button" style={{ ...primaryBtn, background: "#fff", color: ink, border: "1px solid #ddd" }} onClick={copyMessage}>
                        {copied ? "Copied" : "Copy message"}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div style={{ marginTop: 32 }}>
                <button type="button" style={primaryBtn} onClick={() => go("loop")}>Back to the loop</button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {view === "insights" ? (
        <div style={{ display: "grid", gap: 24 }}>
          <h1 style={{ fontSize: 28, margin: 0 }}>Insights</h1>
          <p style={{ color: faint, margin: 0 }}>Read-only. The seed queue is risk-concentrated for review practice, so its hold rate sits above the guard — the full-corpus harness hold stays under it.</p>
          {metrics ? (
            <div style={{ display: "grid", gap: 12 }} data-testid="dashboard">
              <MetricCard testid="metric-autopass" label="Auto-pass" value={`${metrics.autoPassPct.toFixed(1)}%`}>
                {metrics.passes} of {metrics.total} jobs
              </MetricCard>
              <MetricCard testid="metric-touches" label="Touches per job" value={liveTouchesPerJob.toFixed(2)}>
                Before {TOUCHES_BEFORE} → target {TOUCHES_AFTER} · {decidedCount} of {metrics.total} reviewed
              </MetricCard>
              <MetricCard testid="metric-minutes" label="Minutes saved (potential)" value={String(metrics.minutesSaved)}>
                {metrics.passes} passes × 16 min auto-drafted
              </MetricCard>
              <MetricCard
                testid="metric-holdrate"
                label="Hold rate (guard under 40%)"
                value={`${(metrics.holdRate * 100).toFixed(1)}%`}
              >
                {metrics.holds} held ·{" "}
                <span style={{ fontWeight: 700, color: metrics.holdGuardOk ? "green" : "red" }}>
                  {metrics.holdGuardOk
                    ? `Under the ${(HOLD_RATE_GUARD * 100).toFixed(0)}% guard`
                    : `Over the ${(HOLD_RATE_GUARD * 100).toFixed(0)}% guard`}
                </span>
              </MetricCard>
            </div>
          ) : (
            <p style={{ color: faint }}>Loading metrics…</p>
          )}
          <div data-testid="roi">
            <h2 style={{ fontSize: 20 }}>ROI</h2>
            <p style={{ color: faint, fontSize: 14 }}>Every input is an assumption, never a company fact. Monthly proof volume is the weakest input.</p>
            <div style={{ display: "grid", gap: 12 }}>
              {ROI_SLIDERS.map((s) => {
                const meta = assumptions.find((a) => a.key === s.key);
                return (
                  <label
                    key={s.key}
                    data-testid={`roi-${s.key}`}
                    style={
                      meta?.weakest
                        ? { border: "2px solid #b45309", background: "#fffbeb", padding: 8, borderRadius: 8, display: "grid", gap: 4 }
                        : { display: "grid", gap: 4 }
                    }
                  >
                    <span style={{ fontSize: 14 }}>
                      <strong>{meta?.label ?? s.key}</strong> · {meta?.range}
                      {meta?.weakest ? <em> · weakest — confirm with the company</em> : null}
                    </span>
                    <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="range"
                        aria-label={meta?.label ?? s.key}
                        min={s.min}
                        max={s.max}
                        step={s.step}
                        value={roiInputs[s.key]}
                        onChange={(e) => setRoi(s.key, Number(e.target.value))}
                        style={{ flex: 1 }}
                      />
                      <input
                        aria-label={`${meta?.label ?? s.key} value`}
                        value={String(roiInputs[s.key])}
                        inputMode="decimal"
                        style={{ width: 88, padding: 8, fontSize: 14, border: "1px solid #ddd", borderRadius: 8 }}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (e.target.value.trim() !== "" && Number.isFinite(v)) setRoi(s.key, v);
                        }}
                      />
                    </span>
                  </label>
                );
              })}
            </div>
            {roi ? (
              <div style={{ marginTop: 16 }} data-testid="roi-results">
                <p style={{ fontSize: 20, fontWeight: 700 }}>
                  Captured per year: {usdWhole.format(Math.round(roi.capturedAnnual))}
                </p>
                <p style={{ fontSize: 13, color: faint }}>
                  Labor {usdWhole.format(Math.round(roi.laborMonthly))} + reprints{" "}
                  {usdWhole.format(Math.round(roi.reprintMonthly))} per month, year-one capture at 20 to 25% only.
                </p>
              </div>
            ) : null}
          </div>
          {audit.length > 0 ? (
            <div>
              <h2 style={{ fontSize: 20 }}>Audit log</h2>
              <table>
                <tbody>
                  {audit.map((e, i) => (
                    <tr key={`${e.jobId}-${i}`}>
                      <td style={{ padding: "6px 12px 6px 0" }}>{e.jobId}</td>
                      <td style={{ padding: "6px 12px 6px 0", color: faint }}>{e.actor}</td>
                      <td style={{ padding: "6px 12px 6px 0" }}>{e.decision}</td>
                      <td style={{ padding: "6px 12px 6px 0", color: faint }}>{e.verdict}</td>
                      <td style={{ padding: "6px 0", color: faint }}>{(e.elapsedMs / 1000).toFixed(1)}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <p style={{ color: faint, fontSize: 13 }}>
            Production path: static JSON stands in for the Guru spec DB; Guru to RIP to Reply runs mocked in
            shadow mode. Deploy target is Vercel per ADR-0001. The system never charges, reprints, or scraps
            on its own.
          </p>
        </div>
      ) : null}

      {view === "loop" ? (
        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 32, alignItems: "start" }}>
          <aside aria-label="Review queue">
            <p style={{ color: faint, fontSize: 13, fontWeight: 700, margin: "0 0 8px" }}>
              QUEUE · {decidedCount} OF {queue.length} DONE
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              {queue.map((q) => {
                const d = decided[q.id];
                const selected = jobId === q.id && loopScreen === "decide";
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => start(q.id)}
                    style={{
                      display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                      background: "#fff", borderRadius: 10, padding: "10px 12px",
                      border: selected ? "2px solid #111" : "1px solid #e5e5e5",
                    }}
                  >
                    <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <strong style={{ fontSize: 14 }}>{q.id}</strong>
                      <span style={verdictPill(q.result.verdict)}>{q.result.verdict}</span>
                    </span>
                    <span style={{ display: "block", fontSize: 12, color: faint, marginTop: 4 }}>
                      {q.productId} · {Math.round(q.result.measurements.ppi)} PPI
                      {upNext?.id === q.id && !d ? " · up next" : ""}
                      {d ? ` · ✓ ${d}` : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>
          <div>
            {loopScreen === "upnext" ? (
        <div>
          {flash ? <p style={{ color: accent, fontWeight: 600 }}>{flash}</p> : null}
          {!upNext ? (
            <div>
              <h1 style={{ fontSize: 34 }}>Queue clear.</h1>
              <p style={{ color: faint }}>{decidedCount} reviewed this session. Nothing left that needs you.</p>
            </div>
          ) : (
            <div>
              <p style={{ color: accent, fontSize: 13, fontWeight: 700 }}>
                UP NEXT · {upNext.result.verdict}
                {upNext.result.fails.length > 0 ? ` · ${upNext.result.fails.join(", ")}` : ""}
              </p>
              <h1 style={{ fontSize: 40, margin: "8px 0" }}>{upNext.id}</h1>
              <p style={{ color: faint }}>
                {upNext.productId} · {Math.round(upNext.result.measurements.ppi)} PPI · riskiest first · {decidedCount} done
              </p>
              <p style={{ color: faint, fontSize: 13 }}>The loop is the tour — start a review.</p>
              <div style={{ marginTop: 40 }}>
                <button type="button" style={primaryBtn} onClick={() => start(upNext.id)}>Start review</button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {view === "loop" && loopScreen === "decide" && job ? (
        <div>
          <p style={{ color: faint, fontSize: 13 }}>{elapsedS}s · {DEMO_ACTOR}</p>
          {job.result.verdict === "PASS" ? (
            <div>
              <h1 style={{ fontSize: 34 }}>This one is clean.</h1>
              <p style={{ color: faint }}>
                {Math.round(job.result.measurements.ppi)} PPI · bleed {job.result.measurements.bleedWidthIn.toFixed(3)}in · cut line{" "}
                {job.result.measurements.cutlinePresent ? "present" : "missing"}
                {job.result.warnings.length > 0 ? ` · ${job.result.warnings.length} note${job.result.warnings.length > 1 ? "s" : ""}` : ""}
              </p>
              {jobDraft && job.file.endsWith(".png") ? (
                <div style={{ marginTop: 16 }}>
                  {draftFigure(
                    `/api/demo-image?name=${encodeURIComponent(job.file)}`,
                    `Draft for ${job.id}`,
                    jobDraft.overlay,
                    jobBleedPct,
                  )}
                </div>
              ) : null}
              {jobDraft ? (
                <p style={{ color: faint, fontSize: 13 }}>
                  {jobDraft.checklist.filter((t) => t.ok).length}/{jobDraft.checklist.length} checks pass — measured, not hand-checked.
                </p>
              ) : null}
              <div style={{ marginTop: 32 }}>
                {job.result.warnings.length === 0 ? (
                  <button type="button" style={primaryBtn} onClick={() => review("auto-send")}>
                    Auto-send
                  </button>
                ) : (
                  <button type="button" style={primaryBtn} onClick={() => review("approve")}>
                    Approve
                  </button>
                )}
              </div>
              <p style={{ color: faint, fontSize: 13, marginTop: 12 }}>
                {job.result.warnings.length === 0
                  ? "High-confidence pass: sends with an audit entry."
                  : "Needs your approve: something is worth noting."}
              </p>
              {reviewError ? <p role="alert">Error: {reviewError}</p> : null}
            </div>
          ) : (
            <div>
              <h1 style={{ fontSize: 34 }}>
                Needs a fix{job.result.fails.length > 0 ? ` — ${job.result.fails.join(", ")}` : ""}.
              </h1>
              {jobDraft && job.file.endsWith(".png") ? (
                <div style={{ marginTop: 16 }}>
                  {draftFigure(
                    `/api/demo-image?name=${encodeURIComponent(job.file)}`,
                    `Draft for ${job.id}`,
                    jobDraft.overlay,
                    jobBleedPct,
                  )}
                </div>
              ) : (
                <p style={{ color: faint }}>Synthetic seed — no preview image.</p>
              )}
              {jobDraft ? (
                <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8, marginTop: 16 }}>
                  {jobDraft.checklist.map((t) => (
                    <li key={t.id}>
                      <span aria-hidden>{t.ok ? "✓" : "✗"}</span> <strong>{t.label}</strong>{" "}
                      <span style={{ color: faint }}>{t.detail}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {jobDraft ? (
                <pre style={{ whiteSpace: "pre-wrap", background: "#f6f6f8", padding: 12, borderRadius: 8 }}>
                  {jobDraft.message}
                </pre>
              ) : null}
              <div style={{ marginTop: 24 }}>
                <button type="button" style={primaryBtn} onClick={() => review("reject")}>
                  Send fix note
                </button>
              </div>
              <p style={{ marginTop: 16 }}>
                <a href={escalateHref(job)} style={quietLink}>Escalate to support</a>
              </p>
              {reviewError ? <p role="alert">Error: {reviewError}</p> : null}
            </div>
          )}
        </div>
      ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
