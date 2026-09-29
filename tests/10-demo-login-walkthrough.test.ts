import { describe, expect, test } from "bun:test";
import { DEMO_SESSION_KEY, DEMO_USER, createDemoSession, isDemoSession } from "../src/demoAuth";
import { DEMO_STEPS, DEMO_WALKTHROUGH_TOTAL_S } from "../src/demoWalkthrough";

describe("ticket 10: single demo login stands in for auth", () => {
  test("demo user is a fixed single identity with no password", () => {
    expect(DEMO_USER).toBe("demo-artist");
    expect(createDemoSession()).toBe(DEMO_USER);
  });

  test("session check accepts only the demo identity", () => {
    expect(isDemoSession(DEMO_USER)).toBe(true);
    expect(isDemoSession("")).toBe(false);
    expect(isDemoSession(null)).toBe(false);
    expect(isDemoSession(undefined)).toBe(false);
    expect(isDemoSession("admin")).toBe(false);
    expect(isDemoSession(" demo-artist ")).toBe(false);
  });

  test("session key is stable for persistence", () => {
    expect(typeof DEMO_SESSION_KEY).toBe("string");
    expect(DEMO_SESSION_KEY.length).toBeGreaterThan(0);
  });
});

describe("ticket 10: 3-minute walkthrough covers pain to production", () => {
  test("steps total about 3 minutes", () => {
    const total = DEMO_STEPS.reduce((n, s) => n + s.seconds, 0);
    expect(total).toBe(DEMO_WALKTHROUGH_TOTAL_S);
    expect(total).toBe(180);
  });

  test("steps cover pain, overlays, before-and-after, sliders, production path", () => {
    const targets = DEMO_STEPS.map((s) => s.target);
    for (const anchor of ["#upload", "#draft", "#before-after", "#roi", "#production"] as const) {
      expect(targets).toContain(anchor);
    }
  });

  test("each step has an id, title, detail, target, and positive seconds", () => {
    const ids = new Set<string>();
    for (const s of DEMO_STEPS) {
      expect(s.id.length).toBeGreaterThan(0);
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.detail.length).toBeGreaterThan(0);
      expect(s.target.startsWith("#")).toBe(true);
      expect(s.seconds).toBeGreaterThan(0);
      expect(ids.has(s.id)).toBe(false);
      ids.add(s.id);
    }
  });
});
