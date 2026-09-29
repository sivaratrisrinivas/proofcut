export const DEMO_USER = "demo-artist";

export const DEMO_SESSION_KEY = "proofpilot-demo-session";

export function createDemoSession(): string {
  return DEMO_USER;
}

export function isDemoSession(value: unknown): boolean {
  return value === DEMO_USER;
}
