export interface DemoStep {
  id: string;
  title: string;
  detail: string;
  target: string;
  seconds: number;
}

export const DEMO_WALKTHROUGH_TOTAL_S = 180;

export const DEMO_STEPS: DemoStep[] = [
  {
    id: "pain",
    title: "0:00-0:30 · The pain",
    detail: "72dpi 3in die-cut at 72 PPI needs 300 PPI. Every upload waits 60-240 min, then 10-25 min of artist measuring.",
    target: "#upload",
    seconds: 30,
  },
  {
    id: "flagged",
    title: "0:30-1:00 · 5 files flagged in seconds",
    detail: "Run preflight over the demo queue. Two PASS, three SOFT-FAIL with named fails. Panel numbers come from code only.",
    target: "#queue",
    seconds: 30,
  },
  {
    id: "approve",
    title: "1:00-1:30 · Approve 2 clean",
    detail: "Original vs draft with dashed magenta CutContour plus bleed overlay. QC ticks from measurements. Approvals log timer, verdict, actor.",
    target: "#draft",
    seconds: 30,
  },
  {
    id: "fix-notes",
    title: "1:30-2:00 · Send 3 fix notes",
    detail: "Each note names the fail with measured numbers and one rebuild step. Zero banned words. SOFT-FAIL never auto-sends.",
    target: "#draft",
    seconds: 30,
  },
  {
    id: "before-after",
    title: "2:00-2:20 · Before and after",
    detail: "Before 3 touches and about 20 minutes. After 1 touch, about 4 minutes on flagged jobs, zero on clean auto-drafts.",
    target: "#before-after",
    seconds: 20,
  },
  {
    id: "roi",
    title: "2:20-2:45 · ROI sliders",
    detail: "Sliders default to 100k orders per month. Every input is assumed; monthly proof volume is weakest and highlighted.",
    target: "#roi",
    seconds: 25,
  },
  {
    id: "production",
    title: "2:45-3:00 · Production path",
    detail: "Static JSON stands in for Guru. Guru to RIP to Reply runs mocked in shadow mode behind the prototype.",
    target: "#production",
    seconds: 15,
  },
];
