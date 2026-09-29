import { describe, expect, test } from "bun:test";
import { DEMO_SESSION_KEY, DEMO_USER, createDemoSession, isDemoSession } from "../src/demoAuth";

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
