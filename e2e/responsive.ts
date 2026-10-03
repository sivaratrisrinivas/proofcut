// Browser check for the one workflow at phone, tablet and desktop widths.
// Usage: bun run e2e [baseUrl]   (default http://localhost:3000)
// Needs a Chromium build. Run `bunx playwright-core install chromium` once,
// or point CHROMIUM_PATH at an existing Chrome or Chromium binary.
import { chromium, type Page } from "playwright-core";
import { join } from "node:path";

const base = process.argv[2] ?? process.env.BASE_URL ?? "http://localhost:3000";
const root = join(import.meta.dir, "..");
const widths = [360, 390, 768, 1024, 1440];
let failures = 0;

function check(ok: boolean, what: string) {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures++;
}

async function noHorizontalScroll(page: Page, width: number, when: string) {
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  check(sw <= width, `${width}px ${when}: no horizontal scroll (scrollWidth ${sw})`);
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  for (const width of widths) {
    const mobile = width < 800;
    const ctx = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base, { waitUntil: "networkidle" });
    await noHorizontalScroll(page, width, "empty state");

    await page.locator("select").first().selectOption("l2-024.png");
    await page.getByRole("button", { name: "Run preflight" }).click();
    await page.locator(".verdict").waitFor();
    const verdict = await page.locator(".verdict").innerText();
    check(/SOFT-FAIL/.test(verdict) && /bleed/i.test(verdict), `${width}px sample l2-024 shows SOFT-FAIL for bleed`);
    check(/Matches the corpus ground truth/.test(await page.locator(".results").innerText()), `${width}px sample matches ground truth`);
    await noHorizontalScroll(page, width, "result");

    if (mobile) {
      const small = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("button, select, input[type=number], .segmented label, .btn")]
          .map((e) => e.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height < 44).length,
      );
      check(small === 0, `${width}px touch targets are at least 44px tall`);
    }
    check(errors.length === 0, `${width}px no page errors ${errors.join("; ")}`);
    await ctx.close();
  }

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByText("Your file").click();
  await page.locator("input[type=file]").setInputFiles(join(root, "corpus-l2-content", "l2-005.png"));
  await page.locator("select").last().selectOption("roll-label");
  await page.getByRole("button", { name: "Run preflight" }).click();
  await page.locator(".verdict").waitFor();
  check(/bleed/i.test(await page.locator(".verdict").innerText()), "uploaded PNG with a white margin fails bleed, measured from pixels");

  await page.locator("input[type=file]").setInputFiles({ name: "big.png", mimeType: "image/png", buffer: Buffer.alloc(4_600_000) });
  check(/4\.5 MB/.test(await page.locator("p.alert").innerText()), "oversize file shows a plain error before upload");
  await ctx.close();
} finally {
  await browser.close();
}

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("all browser checks passed");
