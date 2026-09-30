"use client";

import { useState } from "react";

// PROTOTYPE direction B — "Full-bleed canvas". Throwaway; pick or discard.
// Job strip on top, large preview canvas + inspector below. Mock data.
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

export default function LoopB() {
  const [sel, setSel] = useState(JOBS[1].id);
  const job = JOBS.find((j) => j.id === sel) ?? JOBS[0];
  return (
    <div style={{ fontFamily: "system-ui", color: "#111" }}>
      <header style={{ display: "flex", gap: 24, padding: "16px 32px", borderBottom: "1px solid #e5e5e5", fontSize: 14 }}>
        <strong>ProofPilot</strong>
        <span style={{ fontWeight: 700 }}>Loop</span>
        <span style={{ color: "#666" }}>New</span>
        <span style={{ color: "#666" }}>Insights</span>
      </header>
      <div style={{ display: "flex", gap: 12, padding: "16px 32px", overflowX: "auto", borderBottom: "1px solid #e5e5e5" }}>
        {JOBS.map((j) => (
          <button
            key={j.id}
            onClick={() => setSel(j.id)}
            style={{
              minWidth: 180, textAlign: "left", cursor: "pointer", borderRadius: 10, padding: "10px 12px", background: "#fff",
              border: j.id === sel ? "2px solid #111" : "1px solid #e5e5e5",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700 }}>{j.id}</div>
            <div style={{ fontSize: 12, color: j.verdict === "PASS" ? "#137333" : "#92400e", marginTop: 2 }}>{j.verdict} · {j.ppi} PPI</div>
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 32, padding: "24px 32px", maxWidth: 1440, margin: "0 auto" }}>
        <section>
          <div style={{ border: "1px solid #ddd", borderRadius: 12, background: "#fafafa", aspectRatio: "4 / 3", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
            <div style={{ border: "2px dashed #c026d3", width: "70%", height: "70%", display: "flex", alignItems: "center", justifyContent: "center", color: "#666", fontSize: 14 }}>
              proof preview — {job.id}
            </div>
          </div>
          <div style={{ fontSize: 13, color: "#666", marginTop: 8 }}>{job.product} · cut line overlay · bleed overlay</div>
        </section>
        <aside>
          <h2 style={{ fontSize: 18, margin: "0 0 4px" }}>{job.id}</h2>
          <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>{job.product}</div>
          {[
            ["Resolution", `${job.ppi} PPI at ordered size`],
            ["Bleed", `${job.bleed.toFixed(3)}in past cut line`],
            ["Cut line", job.cutline ? "CutContour path present" : "CutContour path missing"],
            ["Fails", job.fails.join(", ") || "none"],
          ].map(([k, v]) => (
            <div key={k} style={{ padding: "10px 0", borderTop: "1px solid #eee", fontSize: 14 }}>
              <div style={{ fontSize: 12, color: "#666" }}>{k}</div>
              <div>{v}</div>
            </div>
          ))}
          <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
            {job.verdict === "PASS" ? (
              <><button style={btn("#111", "#fff")}>Approve &amp; send</button><button style={btn("#fff", "#111")}>Auto-send</button></>
            ) : (
              <><button style={btn("#111", "#fff")}>Send fix note</button><button style={btn("#fff", "#111")}>Escalate</button></>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function btn(bg: string, fg: string): React.CSSProperties {
  return { background: bg, color: fg, border: "1px solid #111", borderRadius: 8, padding: "10px 20px", fontSize: 14, cursor: "pointer" };
}
