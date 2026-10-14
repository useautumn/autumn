import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const resolveChromium = (): string => {
	try {
		const path = chromium.executablePath();
		if (path && existsSync(path)) {
			return path;
		}
	} catch {
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

const outDir = process.argv[2] || join(import.meta.dir, "errors-shots");
mkdirSync(outDir, { recursive: true });
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

const visibleFailures = () =>
	page.evaluate(() => {
		const text = document.body.innerText;
		const matches = text.match(/mock failure #(\d+)/g) ?? [];
		const nums = matches.map((m) => Number(m.slice("mock failure #".length)));
		return {
			count: new Set(nums).size,
			min: Math.min(...nums),
			max: Math.max(...nums),
		};
	});

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.getByRole("tab", { name: "Overall" }).click({ timeout: 15_000 });

await page.waitForTimeout(6500);
await page.screenshot({
	path: join(outDir, "1-overall-while-errors-stream.png"),
});

await page.getByRole("tab", { name: "Errors" }).click();
await page.waitForTimeout(1500);
const afterFirstOpen = await visibleFailures();
await page.screenshot({ path: join(outDir, "2-errors-first-open.png") });

await page.getByRole("tab", { name: "Overall" }).click();
await page.waitForTimeout(4000);
await page.getByRole("tab", { name: "Errors" }).click();
await page.waitForTimeout(1500);
const afterReopen = await visibleFailures();
await page.screenshot({ path: join(outDir, "3-errors-reopened.png") });

console.log(
	JSON.stringify({ afterFirstOpen, afterReopen, consoleErrors }, null, 2),
);
const ok =
	afterFirstOpen.count >= 3 &&
	afterFirstOpen.min === 1 &&
	afterReopen.min === 1 &&
	afterReopen.count > afterFirstOpen.count;
console.log(
	ok
		? "PASS: full history visible on open and re-open"
		: "FAIL: history missing",
);
await browser.close();
process.exit(ok ? 0 : 1);
