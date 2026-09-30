"use client";

import { useState } from "react";

// PROTOTYPE direction A — "Review desk". Throwaway; pick or discard.
// Queue rail left, job detail right. Mock data mirrors real copy.
interface Job {
  id: string;
  product: string;
  verdict: "PASS" | "SOFT-FAIL";
  ppi: number;
  bleed: number;
  cutline: boolean;
  fails: string[];
}

const JOBS: Job[] = [
  { id: "l2-004", product: "die-cut 3x2", verdict: "PASS", ppi: 300, bleed: 0.125, cutline: true, fails: [] },
  { id: "l2-005", product: "die-cut 3x3", verdict: "SOFT-FAIL", ppi: 300, bleed: 0.025, cutline: true, fails: ["bleed"] },
  { id: "l2-017", product: "die-cut 3x3", verdict: "SOFT-FAIL", ppi: 72, bleed: 0.125, cutline: true, fails: ["low-ppi"] },
  { id: "l2-027", product: "clear 3x3", verdict: "PASS", ppi: 300, bleed: 0.125, cutline: true, fails: [] },
  { id: "l2-030", product: "clear 3x3", verdict: "SOFT-FAIL", ppi: 300, bleed: 0.125, cutline: true, fails: ["white-ink", "tiny-text"] },
];

const pill = (v: Job["verdict"]): React.CSSProperties => ({
  fontSize: 11,
  fontWeight: 700,
  padding: "2px 8px",
  borderRadius: 999,
  background: v === "PASS" ? "#e6f4ea" : "#fef3c7",
  color: v === "PASS" ? "#137333" : "#92400e",
});

export default function LoopA() {
  const [sel, setSel] = useState(JOBS[0].id);
  const job = JOBS.find((j) => j.id === sel) ?? JOBS[0];
  return (
    <div style={{ fontFamily: "system-ui", color: "#111" }}>
      <header style={{ display: "flex", gap: 24, padding: "16px 32px", borderBottom: "1px solid #e5e5e5", fontSize: 14 }}>
        <strong>ProofPilot</strong>
        <span style={{ fontWeight: 700 }}>Loop</span>
        <span style={{ color: "#666" }}>New</span>
        <span style={{ color: "#666" }}>Insights</span>
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", maxWidth: 1280, margin: "0 auto", minHeight: "calc(100vh - 57px)" }}>
        <aside style={{ borderRight: "1px solid #e5e5e5", padding: 16 }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>QUEUE — 2 OF 5 NEED REVIEW</div>
          {JOBS.map((j) => (
            <button
              key={j.id}
              onClick={() => setSel(j.id)}
              style={{
                display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                border: j.id === sel ? "2px solid #111" : "1px solid #e5e5e5",
                borderRadius: 10, padding: "10px 12px", marginBottom: 8, background: "#fff",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: 14 }}>{j.id}</strong>
                <span style={pill(j.verdict)}>{j.verdict}</span>
              </div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>{j.product} · {j.ppi} PPI</div>
            </button>
          ))}
        </aside>
        <main style={{ padding: "24px 32px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h1 style={{ fontSize: 24, margin: 0 }}>{job.id} <span style={pill(job.verdict)}>{job.verdict}</span></h1>
            <span style={{ fontSize: 13, color: "#666" }}>{job.product}</span>
          </div>
          <dl style={{ display: "grid", gridTemplateColumns: "160px 1fr", rowGap: 8, fontSize: 14, marginTop: 16 }}>
            <dt style={{ color: "#666" }}>Resolution</dt><dd style={{ margin: 0 }}>{job.ppi} PPI at ordered size</dd>
            <dt style={{ color: "#666" }}>Bleed</dt><dd style={{ margin: 0 }}>{job.bleed.toFixed(3)}in past cut line</dd>
            <dt style={{ color: "#666" }}>Cut line</dt><dd style={{ margin: 0 }}>{job.cutline ? "CutContour path present" : "CutContour path missing"}</dd>
            <dt style={{ color: "#666" }}>Fails</dt><dd style={{ margin: 0 }}>{job.fails.join(", ") || "none"}</dd>
          </dl>
          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            {job.verdict === "PASS" ? (
              <><button style={btn("#111", "#fff")}>Approve &amp; send</button><button style={btn("#fff", "#111")}>Auto-send</button></>
            ) : (
              <><button style={btn("#111", "#fff")}>Send fix note</button><button style={btn("#fff", "#111")}>Escalate</button></>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function btn(bg: string, fg: string): React.CSSProperties {
  return { background: bg, color: fg, border: "1px solid #111", borderRadius: 8, padding: "10px 20px", fontSize: 14, cursor: "pointer" };
}
