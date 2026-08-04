import "dotenv/config";
import { existsSync, readdirSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";

// ============================================================================
// Browser test configuration — toggle these for local development / debugging
// ============================================================================

/** Use Kernel cloud browsers instead of local Chromium */
export const USE_KERNEL = !!process.env.USE_KERNEL_BROWSER;
// export const USE_KERNEL = false;

/** Run browsers in headless mode (set false to watch the browser) */
export const HEADLESS = true;

const PLAYWRIGHT_BROWSER_DIR_REGEX = /^chromium(?:_headless_shell)?-(\d+)$/;

/** Binary layouts Playwright uses inside a `chromium*-<revision>` cache dir. */
const PLAYWRIGHT_BINARY_SUFFIXES = [
	"chrome-linux/chrome",
	"chrome-linux/headless_shell",
	"chrome-linux64/chrome",
	"chrome-mac/Chromium.app/Contents/MacOS/Chromium",
	"chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
	"chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
	"chrome-mac-arm64/headless_shell",
	"chrome-mac-x64/headless_shell",
] as const;

const SYSTEM_CHROMIUM_PATHS: Record<string, readonly string[]> = {
	darwin: [
		"/opt/homebrew/bin/chromium",
		"/usr/local/bin/chromium",
		"/Applications/Chromium.app/Contents/MacOS/Chromium",
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	],
	linux: [
		"/usr/bin/chromium",
		"/usr/bin/chromium-browser",
		"/usr/bin/google-chrome",
		"/usr/bin/google-chrome-stable",
	],
};

const playwrightCacheDirs = (): string[] => {
	const home = homedir();
	const candidates = [
		process.env.PLAYWRIGHT_BROWSERS_PATH,
		platform() === "darwin"
			? join(home, "Library", "Caches", "ms-playwright")
			: undefined,
		join(home, ".cache", "ms-playwright"),
		// The tw µVM bakes browsers as root; HOME may differ for the test process.
		"/root/.cache/ms-playwright",
	].filter((dir): dir is string => !!dir && dir !== "0");
	return [...new Set(candidates)];
};

/** Newest-revision-first chromium binaries found in the Playwright caches. */
const scanPlaywrightCaches = (): string[] => {
	const found: { revision: number; path: string }[] = [];
	for (const dir of playwrightCacheDirs()) {
		if (!existsSync(dir)) continue;
		for (const entry of readdirSync(dir)) {
			const revision = PLAYWRIGHT_BROWSER_DIR_REGEX.exec(entry)?.[1];
			if (!revision) continue;
			for (const suffix of PLAYWRIGHT_BINARY_SUFFIXES) {
				const path = join(dir, entry, suffix);
				if (existsSync(path)) found.push({ revision: Number(revision), path });
			}
		}
	}
	return found
		.sort((a, b) => b.revision - a.revision)
		.map((candidate) => candidate.path);
};

const playwrightExecutablePath = (): string | undefined => {
	try {
		return chromium.executablePath();
	} catch {
		return undefined;
	}
};

/**
 * Resolve a launchable Chromium: env → playwright-core's expected revision →
 * any revision in the Playwright caches → system Chrome. Throws (never guesses)
 * so a µVM with a mis-baked browser fails with the paths it probed.
 * The env path is machine-specific (shared Infisical) — honored only if it exists.
 */
const resolveChromiumPath = (): string => {
	const probed: string[] = [];
	const push = (path: string | undefined): string | undefined => {
		if (!path) return undefined;
		probed.push(path);
		return existsSync(path) ? path : undefined;
	};

	const resolved =
		push(process.env.TESTS_CHROMIUM_PATH) ??
		push(playwrightExecutablePath()) ??
		scanPlaywrightCaches().find((path) => push(path)) ??
		(SYSTEM_CHROMIUM_PATHS[platform()] ?? []).find((path) => push(path));

	if (resolved) return resolved;

	throw new Error(
		`No Chromium executable found on ${platform()}. Probed:\n` +
			probed.map((path) => `  - ${path}`).join("\n") +
			"\nInstall it with `bunx playwright@<playwright-core version> install chromium`, " +
			"set TESTS_CHROMIUM_PATH to a real binary, or run with USE_KERNEL_BROWSER=1.",
	);
};

let cachedChromiumPath: string | undefined;

/** Memoized local Chromium path. Lazy: importing this module must not throw
 * when the run uses Kernel browsers instead. */
export const getChromiumPath = (): string => {
	cachedChromiumPath ??= resolveChromiumPath();
	return cachedChromiumPath;
};

/** Kernel browser session timeout in seconds */
export const KERNEL_TIMEOUT_SECONDS = 30;

/** Kernel Playwright execution timeout in seconds */
export const KERNEL_EXECUTE_TIMEOUT_SEC = 120;
