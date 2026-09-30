import { describe, expect, test } from "bun:test";
import { join } from "node:path";

// Ticket 02 (web-redesign): single user, single workflow, nothing more.
// The demo login is gone; this test pins its absence and the one workflow.
describe("single user, single workflow", () => {
  test("no login, no session, no second user in the UI", async () => {
    const source = await Bun.file(join(import.meta.dir, "..", "app", "page.tsx")).text();
    for (const needle of [
      "demoAuth",
      "DEMO_USER",
      "DEMO_ACTOR",
      "DEMO_SESSION_KEY",
      "Continue as",
      "localStorage",
      "/api/queue",
      "/api/metrics",
      "/api/review",
      "MetricCard",
      "ROI_SLIDERS",
      "Insights",
      "Review queue",
      "AuditEntry",
      "audit log",
      "Auto-send",
    ]) {
      expect(source.includes(needle), `page must not contain ${needle}`).toBe(false);
    }
    expect(await Bun.file(join(import.meta.dir, "..", "src", "demoAuth.ts")).exists()).toBe(false);
  });

  test("one workflow: inputs plus run plus one decision action", async () => {
    const source = await Bun.file(join(import.meta.dir, "..", "app", "page.tsx")).text();
    for (const needle of [
      "Run preflight",
      "Approve &amp; send",
      "Send fix note",
      "Escalate to support",
      "/api/preflight",
      "/api/demo-image",
    ]) {
      expect(source.includes(needle), `page must contain ${needle}`).toBe(true);
    }
  });
});
