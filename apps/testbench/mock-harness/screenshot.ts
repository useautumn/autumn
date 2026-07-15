/**
 * Opens the mock-served dashboard in headless Chromium, clicks a tab, and
 * screenshots it — the visual repro loop for chart-rendering bugs.
 * Usage: bun run mock-harness/screenshot.ts <out.png> [tabLabel] (server must be up).
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const resolveChromium = (): string => {
	try {
		const path = chromium.executablePath();
		if (path && existsSync(path)) {
			return path;
		}
	} catch {
		// fall through to cache scan
	}
	const cache = join(process.env.HOME || "", "Library/Caches/ms-playwright");
	const builds = readdirSync(cache)
		.filter((d) => /^chromium-\d+$/.test(d))
		.sort()
		.reverse();
	for (const build of builds) {
		for (const app of [
			"chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
			"chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
			"chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium",
			"chrome-mac/Chromium.app/Contents/MacOS/Chromium",
		]) {
			const candidate = join(cache, build, app);
			if (existsSync(candidate)) {
				return candidate;
			}
		}
	}
	throw new Error(`no chromium build found under ${cache}`);
};

const out = process.argv[2] || join(import.meta.dir, "shot.png");
const tabLabel = process.argv[3] || "Timings";
const url = process.env.URL || "http://localhost:5915";

const browser = await chromium.launch({ executablePath: resolveChromium() });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors: string[] = [];
page.on("console", (message) => {
	if (message.type() === "error") {
		consoleErrors.push(message.text());
	}
});
page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error}`));

await page.goto(url, { waitUntil: "domcontentloaded" });
// Clicks as soon as the tab exists — with PROGRESSIVE=1 on the server this is
// the live-run path where the chart mounts before any data arrives.
await page.getByRole("tab", { name: tabLabel }).click({ timeout: 15_000 });
await page.waitForTimeout(Number.parseInt(process.env.WAIT_MS || "1500", 10));

const diag = await page.evaluate(() => {
	const charts = [...document.querySelectorAll("[data-slot=chart]")];
	return charts.map((chart) => {
		const rect = chart.getBoundingClientRect();
		const responsive = chart.querySelector(
			".recharts-responsive-container",
		) as HTMLElement | null;
		return {
			container: { w: rect.width, h: rect.height },
			responsive: responsive
				? {
						w: responsive.getBoundingClientRect().width,
						h: responsive.getBoundingClientRect().height,
						style: responsive.getAttribute("style"),
					}
				: null,
			svgCount: chart.querySelectorAll("svg").length,
			barRects: chart.querySelectorAll(".recharts-bar-rectangle").length,
			linePaths: chart.querySelectorAll(".recharts-line-curve").length,
			htmlBytes: chart.innerHTML.length,
		};
	});
});

console.log(JSON.stringify({ diag, consoleErrors }, null, 2));
await page.screenshot({ path: out, fullPage: false });
console.log(`screenshot: ${out}`);
await browser.close();
