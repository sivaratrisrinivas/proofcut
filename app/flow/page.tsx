// PROTOTYPE — throwaway shell for the ive-review-flow redesign question:
// "does one-action-per-screen survive a real flagged job?" Wired to the real
// queue/review/demo-image seams; no tests, in-memory state, no polish.
"use client";

import { useEffect, useState } from "react";
import type { Job } from "../../src/queue";
import type { AuditEntry } from "../../src/audit";
import { buildChecklist, composeMessage } from "../../src/draft";

type Variant = "1" | "2" | "3";
type Screen = "upnext" | "decide" | "done" | "new" | "insights";

const ACTOR = "demo-artist";
const ink = "#111";
const faint = "#777";
const accent = "#c026d3";

const shell: React.CSSProperties = {
  maxWidth: 560,
  margin: "0 auto",
  padding: "48px 24px 120px",
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

const quietLink: React.CSSProperties = { color: faint, fontSize: 14, textDecoration: "none" };

function useVariant(): Variant {
  const [v, setV] = useState<Variant>("1");
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("v");
    if (m === "2" || m === "3") setV(m);
  }, []);
  return v;
}

function escalateHref(job: Job): string {
  const subject = encodeURIComponent(`ProofPilot escalation: ${job.id}`);
  const body = encodeURIComponent(`Job ${job.id} needs support review. Verdict: ${job.result.verdict}.`);
  return `mailto:support@proofpilot.example?subject=${subject}&body=${body}`;
}

export default function FlowPrototype() {
  const variant = useVariant();
  const [queue, setQueue] = useState<Job[]>([]);
  const [screen, setScreen] = useState<Screen>("upnext");
  const [jobId, setJobId] = useState("");
  const [startMs, setStartMs] = useState(0);
  const [nowMs, setNowMs] = useState(0);
  const [decided, setDecided] = useState<Record<string, string>>({});
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [flash, setFlash] = useState("");
  const [metrics, setMetrics] = useState<{ total: number; passes: number; holds: number } | null>(null);

  useEffect(() => {
    fetch("/api/queue?filter=all")
      .then((r) => r.json())
      .then((d) => setQueue(d.jobs ?? []))
      .catch(() => {});
    fetch("/api/metrics")
      .then((r) => r.json())
      .then((d) => (d.dashboard ? setMetrics(d.dashboard) : null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (screen !== "decide") return;
    setNowMs(Date.now());
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [screen, jobId]);

  const upNext = queue.find((j) => !decided[j.id]) ?? null;
  const job = queue.find((j) => j.id === jobId) ?? null;
  const elapsedS = Math.max(0, Math.round((nowMs - startMs) / 1000));

  function start(id: string) {
    setJobId(id);
    setStartMs(Date.now());
    setNowMs(Date.now());
    setFlash("");
    setScreen("decide");
  }

  async function decide(kind: "approve" | "fix") {
    if (!job) return;
    const res = await fetch("/api/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jobId: job.id,
        decision: kind === "approve" ? "approve" : "reject",
        actor: ACTOR,
        elapsedMs: Date.now() - startMs,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      setFlash(body.error ?? "review failed");
      return;
    }
    setAudit((a) => [...a, body.entry as AuditEntry]);
    setDecided((d) => ({ ...d, [job.id]: kind }));
    if (variant === "3") {
      setFlash(kind === "approve" ? "Approved." : "Fix note sent.");
      setScreen("upnext");
      setJobId("");
    } else {
      setScreen("done");
    }
  }

  function stepDots(n: number) {
    return (
      <p style={{ color: faint, fontSize: 13, letterSpacing: 2 }} aria-hidden>
        {["1", "2", "3"].map((s, i) => (i < n ? "●" : "○")).join(" ")}
        <span style={{ letterSpacing: 0, marginLeft: 8 }}>
          Step {n} of 3
        </span>
      </p>
    );
  }

  function chrome(n: number) {
    return variant === "1" ? stepDots(n) : null;
  }

  function jobImage(j: Job) {
    if (!j.file.endsWith(".png")) return <p style={{ color: faint }}>Synthetic seed — no preview image.</p>;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/demo-image?name=${encodeURIComponent(j.file)}`} alt={`Proof for ${j.id}`} style={{ width: "100%", display: "block", borderRadius: 12 }} />;
  }

  let body: React.ReactNode = null;

  if (screen === "new") {
    body = (
      <div>
        <h1 style={{ fontSize: 28 }}>New proof</h1>
        <p style={{ color: faint }}>Upload lives outside the loop — stub in this prototype.</p>
        <p><a href="#" onClick={(e) => { e.preventDefault(); setScreen(upNext ? "upnext" : "done"); }} style={quietLink}>← Back to the loop</a></p>
      </div>
    );
  } else if (screen === "insights") {
    body = (
      <div>
        <h1 style={{ fontSize: 28 }}>Insights</h1>
        <p style={{ color: faint }}>Read-only in this prototype. No actions here.</p>
        {metrics ? <p>{metrics.passes} of {metrics.total} auto-pass · {metrics.holds} held</p> : <p>Loading…</p>}
        <p><a href="#" onClick={(e) => { e.preventDefault(); setScreen("upnext"); }} style={quietLink}>← Back to the loop</a></p>
      </div>
    );
  } else if (screen === "done" && job) {
    body = (
      <div>
        {chrome(3)}
        <h1 style={{ fontSize: 28 }}>{decided[job.id] === "approve" ? "Approved." : "Fix note sent."}</h1>
        <p style={{ color: faint }}>Logged with timer, verdict, and actor.</p>
        <button type="button" style={primaryBtn} onClick={() => { setScreen("upnext"); setJobId(""); }}>
          {upNext ? `Next job${upNext.result.verdict === "SOFT-FAIL" ? ` — ${upNext.id}` : ""}` : "Queue clear"}
        </button>
      </div>
    );
  } else if (screen === "decide" && job) {
    const fails = job.result.fails.length > 0 ? ` — ${job.result.fails.join(", ")}` : "";
    if (job.result.verdict === "PASS") {
      body = (
        <div>
          {chrome(2)}
          <p style={{ color: faint }}>{elapsedS}s · {ACTOR}</p>
          <h1 style={{ fontSize: 28 }}>This one is clean.</h1>
          <p style={{ color: faint }}>{Math.round(job.result.measurements.ppi)} PPI · bleed {job.result.measurements.bleedWidthIn.toFixed(3)}in · cut line {job.result.measurements.cutlinePresent ? "present" : "missing"}{fails}</p>
          {jobImage(job)}
          <div style={{ marginTop: 24 }}>
            <button type="button" style={primaryBtn} onClick={() => decide("approve")}>Approve</button>
          </div>
          {flash ? <p role="alert">{flash}</p> : null}
        </div>
      );
    } else {
      let checks: React.ReactNode = null;
      let note = "";
      try {
        const list = buildChecklist(job.result);
        note = composeMessage(job.result);
        checks = (
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
            {list.map((t) => (
              <li key={t.id}><span aria-hidden>{t.ok ? "✓" : "✗"}</span> <strong>{t.label}</strong> <span style={{ color: faint }}>{t.detail}</span></li>
            ))}
          </ul>
        );
      } catch {
        checks = <p style={{ color: faint }}>Checks unavailable for this job.</p>;
      }
      body = (
        <div>
          {chrome(2)}
          <p style={{ color: faint }}>{elapsedS}s · {ACTOR}</p>
          <h1 style={{ fontSize: 28 }}>Needs a fix{fails}.</h1>
          {jobImage(job)}
          <div style={{ marginTop: 16 }}>{checks}</div>
          <pre style={{ whiteSpace: "pre-wrap", background: "#f6f6f8", padding: 12, borderRadius: 8 }}>{note}</pre>
          <button type="button" style={primaryBtn} onClick={() => decide("fix")}>Send fix note</button>
          <p style={{ marginTop: 16 }}><a href={escalateHref(job)} style={quietLink}>Escalate to support</a></p>
          {flash ? <p role="alert">{flash}</p> : null}
        </div>
      );
    }
  } else {
    body = (
      <div>
        {chrome(1)}
        {flash && variant === "3" ? <p style={{ color: accent }}>{flash}</p> : null}
        {!upNext ? (
          <div>
            <h1 style={{ fontSize: 28 }}>Queue clear.</h1>
            <p style={{ color: faint }}>{Object.keys(decided).length} reviewed this session.</p>
          </div>
        ) : (
          <div>
            <p style={{ color: accent, fontSize: 13, fontWeight: 700 }}>UP NEXT · {upNext.result.verdict}{upNext.result.fails.length > 0 ? ` · ${upNext.result.fails.join(", ")}` : ""}</p>
            <h1 style={{ fontSize: 34, margin: "8px 0" }}>{upNext.id}</h1>
            <p style={{ color: faint }}>{upNext.productId} · {Math.round(upNext.result.measurements.ppi)} PPI · riskiest first · {Object.keys(decided).length} done</p>
            <div style={{ marginTop: 32 }}>
              <button type="button" style={primaryBtn} onClick={() => start(upNext.id)}>Start review</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={shell}>
      {body}
      <details style={{ marginTop: 48, color: faint, fontSize: 12 }}>
        <summary>Prototype state (v{variant} · {screen})</summary>
        <pre>{JSON.stringify({ screen, jobId, decided, audit: audit.map((e) => `${e.jobId}:${e.decision}`) }, null, 2)}</pre>
      </details>
      <nav style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "#fff", borderTop: "1px solid #eee", padding: "10px 16px", display: "flex", gap: 16, alignItems: "center", fontSize: 14 }}>
        <span style={{ color: faint }}>Prototype:</span>
        <a href="/flow?v=1" style={quietLink}>v1 wizard</a>
        <a href="/flow?v=2" style={quietLink}>v2 stageless</a>
        <a href="/flow?v=3" style={quietLink}>v3 auto</a>
        <span style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
          <a href="#" onClick={(e) => { e.preventDefault(); setScreen("new"); }} style={quietLink}>New</a>
          <a href="#" onClick={(e) => { e.preventDefault(); setScreen("insights"); }} style={quietLink}>Insights</a>
        </span>
      </nav>
    </div>
  );
}
